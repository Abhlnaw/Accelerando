package org.accelerando.practice;

import org.junit.Test;
import java.util.Random;
import static org.junit.Assert.*;

public class PeriodicPitchTest {
    @Test public void detectsQuietLowAndHighHarmonicTones() {
        PeriodicPitch detector = new PeriodicPitch();
        for (int midi : new int[]{33,40,45,52,57,69,81}) {
            float[] samples = new float[1024];
            double hz = 440*Math.pow(2,(midi-69)/12.0);
            for (int i=0;i<samples.length;i++) {
                double phase = 2*Math.PI*hz*i/16000;
                samples[i]=(float)(.0004*(Math.sin(phase)+1.3*Math.sin(2*phase)+.5*Math.sin(3*phase)));
            }
            assertEquals("MIDI "+midi,midi,detector.midi(samples,24,95),.4);
        }
    }
    @Test public void rejectsSilenceAndAperiodicNoise() {
        float[] samples = new float[1024];
        PeriodicPitch detector = new PeriodicPitch();
        assertTrue(Double.isNaN(detector.midi(samples,24,95)));
        Random noise = new Random(42);
        for(int i=0;i<samples.length;i++) samples[i]=(float)(.001*noise.nextGaussian());
        assertTrue(Double.isNaN(detector.midi(samples,24,95)));
    }
}
