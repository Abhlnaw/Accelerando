package org.accelerando.practice;

import static org.junit.Assert.*;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.InputStream;

public class MediaTakeTest {
    @Test public void decodesSyntheticLowAFromAudioAndVideo() throws Exception {
        for (String ext:new String[]{"mp3","m4a","mp4"}) {
            try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("tone."+ext)){
                WavInput decoded=WavInput.parse(MediaTake.wav(MainActivity.readLimited(in,100000)));
                assertEquals(ext,16000,decoded.rate);
                assertTrue(ext,decoded.frames>=15500 && decoded.frames<18000);
                int crossings=0;
                for(int i=4001;i<=12000;i++)
                    if(decoded.sample16k(i)>0 && decoded.sample16k(i-1)<=0) crossings++;
                assertEquals(ext,55,crossings,2);
            }
        }
    }
}
