package org.accelerando.practice;

import android.media.*;
import android.os.SystemClock;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;

/** Decode the first audio track locally. Bound decoded output independently of upload size. */
final class MediaTake {
    static byte[] wav(byte[] file) throws IOException {
        if (file.length >= 12 && file[0]=='R' && file[1]=='I' && file[2]=='F' && file[3]=='F') return file;
        MediaExtractor source = new MediaExtractor();
        try {
            source.setDataSource(new MediaDataSource() {
                public long getSize(){ return file.length; }
                public void close(){}
                public int readAt(long pos, byte[] buffer,int offset,int size){
                    if(pos<0 || pos>=file.length)return -1;
                    int count=Math.min(size,file.length-(int)pos);
                    System.arraycopy(file,(int)pos,buffer,offset,count);
                    return count;
                }
            });
            for(int i=0;i<source.getTrackCount();i++){
                MediaFormat format=source.getTrackFormat(i);
                String mime=format.getString(MediaFormat.KEY_MIME);
                if(mime==null || !mime.startsWith("audio/"))continue;
                if(format.containsKey(MediaFormat.KEY_DURATION) && format.getLong(MediaFormat.KEY_DURATION)>180_000_000L)
                    throw new IOException("Trim the recording to three minutes.");
                source.selectTrack(i);
                MediaCodec decoder=MediaCodec.createDecoderByType(mime);
                try {
                    decoder.configure(format,null,null,0);
                    decoder.start();
                    return decode(source,decoder,format);
                } finally { decoder.release(); }
            }
            throw new IOException("This file has no audio track.");
        } catch(RuntimeException e){ throw new IOException("Cannot decode this recording. Try MP3, M4A, MP4 with audio, or PCM WAV.",e); }
        finally {source.release();}
    }

    private static byte[] decode(MediaExtractor source,MediaCodec decoder,MediaFormat format)throws IOException {
        ByteArrayOutputStream pcm=new ByteArrayOutputStream();
        MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
        boolean ended=false;
        int phase=0;
        long deadline=SystemClock.elapsedRealtime()+60_000;
        while(SystemClock.elapsedRealtime()<deadline){
            int input=ended?-1:decoder.dequeueInputBuffer(10000);
            if(input>=0){
                ByteBuffer buffer=decoder.getInputBuffer(input);
                buffer.clear();
                int size=source.readSampleData(buffer,0);
                ended=size<0;
                decoder.queueInputBuffer(input,0,Math.max(0,size),ended?0:source.getSampleTime(),ended?MediaCodec.BUFFER_FLAG_END_OF_STREAM:0);
                if(!ended)source.advance();
            }
            int out=decoder.dequeueOutputBuffer(info,10000);
            if(out==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED)format=decoder.getOutputFormat();
            if(out<0)continue;
            int rate=format.getInteger(MediaFormat.KEY_SAMPLE_RATE), channels=format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            if(rate<8000 || rate>192000 || channels<1 || channels>8 ||
                format.getInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT)!=AudioFormat.ENCODING_PCM_16BIT)
                throw new IOException("Unsupported decoded audio format. Export MP3 or PCM WAV.");
            ByteBuffer data=decoder.getOutputBuffer(out).order(ByteOrder.LITTLE_ENDIAN);
            data.position(info.offset);data.limit(info.offset+info.size);
            while(data.remaining()>=2*channels){
                int sum=0;
                for(int c=0;c<channels;c++)sum+=data.getShort();
                int value=sum/channels;
                phase+=16000;
                while(phase>=rate){pcm.write(value);pcm.write(value>>8);phase-=rate;}
            }
            decoder.releaseOutputBuffer(out,false);
            if(pcm.size()>16000*2*180)throw new IOException("Trim the recording to three minutes.");
            if((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0){
                if(pcm.size()==0)throw new IOException("The audio track is empty.");
                ByteBuffer wav=ByteBuffer.allocate(44+pcm.size()).order(ByteOrder.LITTLE_ENDIAN);
                wav.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+pcm.size());
                wav.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1);
                wav.putInt(16000).putInt(32000).putShort((short)2).putShort((short)16);
                wav.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.size()).put(pcm.toByteArray());
                return wav.array();
            }
        }
        throw new IOException("Decoding timed out. Try a shorter recording.");
    }
}
