package org.accelerando.practice;
import java.util.Random;
import org.junit.Test;
import static org.junit.Assert.*;
public class NoiseFilterTest {
    @Test public void broadbandNoiseFallsWhileLowMelodySurvives(){
        NoiseFilter filter=new NoiseFilter();
        Random random=new Random(19);
        double raw=0,clean=0,reference=0,projection=0;
        for(int n=0;n<32;n++){
            float[] frame=new float[1024],tone=new float[1024];
            for(int i=0;i<1024;i++){
                tone[i]=(float)(.005*Math.sin(2*Math.PI*110*(1024*n+i)/16000));
                frame[i]=tone[i]+(float)(.002*random.nextGaussian());
                raw+=Math.pow(frame[i]-tone[i],2);
            }
            filter.clean(frame);
            for(int i=0;i<1024;i++){
                clean+=Math.pow(frame[i]-tone[i],2);
                reference+=tone[i]*tone[i];projection+=frame[i]*tone[i];
            }
        }
        assertTrue(clean<raw*.75);
        assertEquals(1,projection/reference,.03);
    }
}
