package org.accelerando.practice;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Strict PCM decoder shared by uploads and JVM tests. Samples keep the source clock. */
final class WavInput {
    private final byte[] data;
    final int rate,channels,frames,offset;
    private WavInput(byte[] data,int rate,int channels,int frames,int offset){this.data=data;this.rate=rate;this.channels=channels;this.frames=frames;this.offset=offset;}
    static WavInput parse(byte[] data)throws IOException{
        if(data==null||data.length<44||!tag(data,0).equals("RIFF")||!tag(data,8).equals("WAVE"))throw new IOException("Upload an uncompressed 16-bit PCM WAV recording.");
        int rate=0,channels=0,bits=0,format=0,offset=0,length=0;
        for(int p=12;p+8<=data.length;){
            int size=integer(data,p+4,4);if(size<0||size>data.length-p-8)throw new IOException("Incomplete WAV file. Export the recording again.");
            String id=tag(data,p);
            if(id.equals("fmt ")){if(size<16)throw new IOException("Incomplete WAV format header.");format=integer(data,p+8,2);channels=integer(data,p+10,2);rate=integer(data,p+12,4);bits=integer(data,p+22,2);}
            if(id.equals("data")){if(offset!=0)throw new IOException("Export a WAV with one audio data section.");offset=p+8;length=size;}
            p+=8+size+(size&1);
        }
        if(format!=1||bits!=16||channels<1||channels>2||rate<8000||rate>96000)throw new IOException("Export as a mono or stereo 16-bit PCM WAV, 8–96 kHz.");
        if(length==0||length%(2*channels)!=0)throw new IOException("This WAV has no complete audio frames. Export it again.");
        int frames=length/(2*channels);if(frames>(long)rate*180)throw new IOException("Trim the recording to 3 minutes or less.");
        return new WavInput(data,rate,channels,frames,offset);
    }
    int samples16k(){return (int)((long)frames*16000/rate);}
    float sample16k(int index){
        double position=index*rate/16000.0;int first=(int)position,last=Math.min(first+1,frames-1);float a=0,b=0;
        for(int channel=0;channel<channels;channel++){
            a+=(short)integer(data,offset+2*(first*channels+channel),2)/32768f/channels;
            b+=(short)integer(data,offset+2*(last*channels+channel),2)/32768f/channels;
        }
        return (float)(a+(b-a)*(position-first));
    }
    private static String tag(byte[] b,int p){return new String(b,p,4,StandardCharsets.US_ASCII);}
    private static int integer(byte[] b,int p,int count){int value=0;for(int j=0;j<count;j++)value|=(b[p+j]&255)<<(8*j);return value;}
}
