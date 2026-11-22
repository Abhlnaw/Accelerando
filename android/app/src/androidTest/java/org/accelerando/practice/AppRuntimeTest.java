package org.accelerando.practice;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Runs against the packaged WebView, JNI ONNX runtime and app storage on Android. */
@RunWith(AndroidJUnit4.class)
public class AppRuntimeTest {
    private String js(ActivityScenario<MainActivity> scenario,String expression)throws Exception{
        CompletableFuture<String> result=new CompletableFuture<>();scenario.onActivity(a->a.web.evaluateJavascript(expression,result::complete));return result.get(10,TimeUnit.SECONDS);
    }
    private void await(ActivityScenario<MainActivity> scenario,String condition)throws Exception{
        long end=System.currentTimeMillis()+30000;String last="";
        while(System.currentTimeMillis()<end){last=js(scenario,condition);if(last.equals("true"))return;Thread.sleep(50);}
        fail("Timed out: "+condition+"; last="+last+"; notice="+js(scenario,"document.getElementById('notice').textContent"));
    }
    @Test public void homeNavigationAndRealNotationWork()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            await(scenario,"typeof window.nativeEvent==='function'");
            assertEquals("false",js(scenario,"document.getElementById('home-page').hidden"));
            js(scenario,"document.querySelector('[data-page=library]').click();document.getElementById('twinkle').click()");
            await(scenario,"document.querySelectorAll('#score svg').length>=6 && !document.getElementById('start').disabled");
            assertEquals("42",js(scenario,"document.querySelectorAll('#score [data-note]').length"));
            js(scenario,"document.querySelector('[data-page=library]').click()");
            assertEquals("false",js(scenario,"document.getElementById('library-page').hidden"));
            js(scenario,"document.querySelector('[data-page=progress]').click()");
            assertEquals("false",js(scenario,"document.getElementById('progress-page').hidden"));
            js(scenario,"document.querySelector('[data-page=tools]').click()");
            await(scenario,"!!document.querySelector('#tools-page iframe')?.contentDocument?.getElementById('listen')");
            await(scenario,"!!document.querySelector('#tools-page iframe').contentWindow.stopPracticeTools");
            js(scenario,"document.querySelector('[data-page=home]').click()");
            assertEquals("true",js(scenario,"document.querySelector('#tools-page iframe')===null"));
            assertEquals("true",js(scenario,"window.Android.saveData('settings',JSON.stringify({instrument:'guitar',mode:'expressive',pieceId:'twinkle'}))"));
            assertEquals("false",js(scenario,"window.Android.saveData('../bad','[]')"));
        }
    }
    @Test public void quietLowRegisterReachesTheRecorderOutput()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        for(int expected:new int[]{40,45,57}){
            List<Double> heard=new ArrayList<>();
            double hz=440*Math.pow(2,(expected-69)/12.0);
            try(PitchEngine engine=new PitchEngine(context)){
                for(int i=0;i<16000;i++){
                    double phase=2*Math.PI*hz*i/16000;
                    engine.sample((float)(.0005*(Math.sin(phase)+.65*Math.sin(2*phase))),
                        (t,m,c,r,ms,clip)->{if(c>=.60)heard.add(m);});
                }
            }
            assertTrue("Detect quiet MIDI "+expected,heard.size()>15);
            Collections.sort(heard);assertEquals(expected,heard.get(heard.size()/2),.5);
        }
    }
    @Test public void localNeuralInferenceAndIndependentRecordingsWork()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        List<Double> pitches=new ArrayList<>();List<Double> times=new ArrayList<>();
        TakeRepository repository=new TakeRepository(context);String first,second;
        try(PitchEngine engine=new PitchEngine(context)){
            for(int i=0;i<16000;i++)engine.sample((float)(.2*Math.sin(2*Math.PI*440*i/16000)),(t,m,c,r,ms,clip)->{if(c>=.65)pitches.add(m);times.add(t);});
            assertTrue("Model must hear A4",pitches.size()>10);Collections.sort(pitches);assertEquals(69,pitches.get(pitches.size()/2),.3);
            assertEquals(1,engine.durationSeconds(),1e-6);assertTrue(times.get(0)>=0);assertTrue(times.get(times.size()-1)<1);
            first=repository.save(engine);
        }
        try(PitchEngine engine=new PitchEngine(context)){
            for(int i=0;i<8000;i++)engine.sample(0,(t,m,c,r,ms,clip)->assertEquals(0,c,0));
            second=repository.save(engine);
        }
        assertNotEquals(first,second);assertEquals(32044,repository.find(first).length());assertEquals(16044,repository.find(second).length());
        assertNull(repository.find("../last-take"));
        try(PitchEngine engine=new PitchEngine(context)){
            engine.stop();byte[] bytes=java.nio.file.Files.readAllBytes(repository.find(first).toPath());
            engine.analyzeWav(bytes,(t,m,c,r,ms,clip)->fail("Cancelled work must not restart"));assertEquals(0,engine.durationSeconds(),0);
        }
    }
    @Test public void uploadedScoreAudioReportAndRestartUseRealBackend()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        int[] pitches={60,62,65,65,67,69};StringBuilder notes=new StringBuilder();
        for(String step:new String[]{"C","D","E","F","G","A"})notes.append("<note><pitch><step>").append(step).append("</step><octave>4</octave></pitch><duration>1</duration></note>");
        String source="<score-partwise><work><work-title>Runtime Test Melody</work-title></work><part id=\"P1\"><measure number=\"1\"><attributes><divisions>1</divisions></attributes>"+notes+"</measure></part></score-partwise>";
        File score=new File(context.getCacheDir(),"runtime-score.musicxml"),audio=new File(context.getCacheDir(),"runtime-take.wav");
        java.nio.file.Files.write(score.toPath(),source.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try(PitchEngine synth=new PitchEngine(context)){
            for(int pitch:pitches)for(int i=0;i<9600;i++){
                double envelope=Math.min(1,Math.min(i,8799-i)/160.0);float value=i<8800?(float)(.2*Math.max(0,envelope)*Math.sin(2*Math.PI*440*Math.pow(2,(pitch-69)/12.0)*i/16000)):0;
                synth.sample(value,(t,m,c,r,ms,clip)->{});
            }
            synth.writeWav(audio);
        }
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            await(scenario,"typeof window.nativeEvent==='function'");
            js(scenario,"document.getElementById('instrument').value='piano';document.getElementById('instrument').onchange()");
            scenario.onActivity(a->a.onActivityResult(42,android.app.Activity.RESULT_OK,new android.content.Intent().setData(android.net.Uri.fromFile(score))));
            await(scenario,"document.getElementById('piece-title').textContent==='Runtime Test Melody'");
            long start=android.os.SystemClock.elapsedRealtime();
            scenario.onActivity(a->{try{java.lang.reflect.Field kind=MainActivity.class.getDeclaredField("importKind");kind.setAccessible(true);kind.set(a,"take");a.onActivityResult(42,android.app.Activity.RESULT_OK,new android.content.Intent().setData(android.net.Uri.fromFile(audio)));}catch(Exception ex){throw new RuntimeException(ex);}});
            await(scenario,"!document.getElementById('report').hidden && document.getElementById('start').hidden===false");
            assertTrue("Report must follow playback of the 3.6-second upload", android.os.SystemClock.elapsedRealtime()-start>=3400);
            assertEquals("true",js(scenario,"JSON.parse(Android.loadData('history')).some(r=>r.title==='Runtime Test Melody' && r.grade>60 && r.grade<99 && !!r.recordingId)"));
            assertEquals("false",js(scenario,"document.getElementById('replay-full').disabled"));
            js(scenario,"document.querySelector('#findings button').click()");
            await(scenario,"document.getElementById('notice').textContent.includes('Playing audio')");
            await(scenario,"['Passage finished.','Playback finished.'].includes(document.getElementById('notice').textContent)");
            js(scenario,"document.getElementById('replay-full').click()");
            await(scenario,"document.getElementById('notice').textContent.includes('Playing audio') || document.getElementById('notice').textContent.includes('Playback finished')");
            js(scenario,"document.getElementById('stop-take-playback').click()");
            await(scenario,"document.getElementById('notice').textContent==='Playback stopped.'");
        }
        try(ActivityScenario<MainActivity> restarted=ActivityScenario.launch(MainActivity.class)){
            await(restarted,"typeof window.nativeEvent==='function'");
            assertEquals("false",js(restarted,"document.getElementById('home-page').hidden"));
            assertEquals("\"Runtime Test Melody\"",js(restarted,"document.getElementById('home-piece').textContent"));
            js(restarted,"document.querySelector('#home-recent button').click()");
            assertEquals("false",js(restarted,"document.getElementById('report').hidden"));
            assertEquals("false",js(restarted,"document.getElementById('replay-full').disabled"));
        }
        score.delete();audio.delete();
    }
}
