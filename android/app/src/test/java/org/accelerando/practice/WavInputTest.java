package org.accelerando.practice;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.Arrays;

public class WavInputTest {
    static void le(OutputStream out,int n,int count)throws IOException{for(int i=0;i<count;i++)out.write((n>>(8*i))&255);}
    static byte[] wav(int rate,int channels,int frames)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write("RIFF".getBytes());le(out,36+frames*channels*2,4);out.write("WAVEfmt ".getBytes());le(out,16,4);le(out,1,2);le(out,channels,2);le(out,rate,4);le(out,rate*channels*2,4);le(out,channels*2,2);le(out,16,2);out.write("data".getBytes());le(out,frames*channels*2,4);
        for(int frame=0;frame<frames;frame++)for(int c=0;c<channels;c++)le(out,c==0?8192:0,2);return out.toByteArray();
    }
    @Test public void monoResamplingPreservesOriginalDuration()throws Exception{
        WavInput input=WavInput.parse(wav(48000,1,48000));assertEquals(16000,input.samples16k());assertEquals(.25,input.sample16k(8000),1e-6);
    }
    @Test public void fullTakeResamplesThroughLastFrame()throws Exception{
        WavInput input=WavInput.parse(wav(48000,1,48000*25));
        assertEquals(.25,input.sample16k(input.samples16k()-1),1e-6);
    }
    @Test public void stereoIsDownmixedWithoutChangingClock()throws Exception{
        WavInput input=WavInput.parse(wav(22050,2,22050));assertEquals(16000,input.samples16k());assertEquals(.125,input.sample16k(123),1e-6);
    }
    @Test public void lowSampleRateCanBeUpsampled()throws Exception{
        WavInput input=WavInput.parse(wav(8000,1,8000));assertEquals(16000,input.samples16k());assertEquals(.25,input.sample16k(15999),1e-6);
    }
    @Test public void oppositePolarityStereoKeepsThePerformance()throws Exception{
        byte[] bytes=wav(16000,2,100);for(int i=0;i<100;i++){bytes[44+i*4+2]=0;bytes[44+i*4+3]=(byte)0xe0;}
        assertEquals(.25,WavInput.parse(bytes).sample16k(50),1e-6);
    }
    @Test public void corruptEmptyAndTruncatedFilesFail()throws Exception{
        for(byte[] data:new byte[][]{new byte[0],wav(16000,1,0),Arrays.copyOf(wav(16000,1,100),100)})assertThrows(IOException.class,()->WavInput.parse(data));
    }
    @Test public void unsupportedFormatFailsBeforeAnalysis()throws Exception{
        byte[] data=wav(16000,1,100);data[20]=3;assertThrows(IOException.class,()->WavInput.parse(data));
    }
    @Test public void oversizedClipIsRejected()throws Exception{assertThrows(IOException.class,()->WavInput.parse(wav(8000,1,8000*180+1)));}
}
