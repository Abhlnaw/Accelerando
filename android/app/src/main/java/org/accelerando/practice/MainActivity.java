package org.accelerando.practice;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile PitchEngine engine;
    private volatile boolean busy=false;
    private String importKind="score";
    private int low=24,high=95;
    private MediaPlayer player;
    private volatile boolean destroyed;
    private String exportData="";
    private volatile boolean cancelled;
    private int sessionSequence;
    private TakeRepository repository;
    private PermissionRequest pendingTunerMic;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        repository=new TakeRepository(this);
        getWindow().setStatusBarColor(0xff251a15);
        getWindow().setNavigationBarColor(0xff251a15);
        web=new WebView(this);setContentView(web);
        web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request) {
                boolean audio = java.util.Arrays.asList(request.getResources())
                        .contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                if (busy || !audio || !"https://appassets.androidplatform.net".equals(
                        request.getOrigin().toString().replaceAll("/$", ""))) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else if (pendingTunerMic == null) {
                    pendingTunerMic = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},44);
                } else request.deny();
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingTunerMic == request) pendingTunerMic=null;
            }
        });
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if(!"appassets.androidplatform.net".equals(uri.getHost()))return new WebResourceResponse("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));
                String path=uri.getPath();
                if(path==null||path.contains(".."))return null;
                try {
                    if (path.startsWith("/studio-assets/")) {
                        String asset = path.substring("/studio-assets/".length());
                        if (asset.matches("[a-z-]+\\.(woff2|webp)")) {
                            String mime = asset.endsWith(".woff2") ? "font/woff2" : "image/webp";
                            return new WebResourceResponse(mime, null, getAssets().open(asset));
                        }
                    }
                    String name="web"+(path.equals("/")?"/index.html":path);
                    String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".json")?"application/json":"text/html";
                    return new WebResourceResponse(mime,"utf-8",getAssets().open(name));
                }catch(IOException ex){return new WebResourceResponse("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                // Only the bundled entry page receives the bridge, never an imported document.
                if(!request.isForMainFrame()&&"https".equals(request.getUrl().getScheme())&&"appassets.androidplatform.net".equals(request.getUrl().getHost())&&(request.getUrl().getPath().startsWith("/tools/") || "/game/index.html".equals(request.getUrl().getPath())))return false;
                openExternal(request.getUrl().toString());return true;
            }
        });
        web.addJavascriptInterface(new Bridge(),"Android");
        web.loadUrl("https://appassets.androidplatform.net/");
    }

    private void event(String type,JSONObject payload) {
        runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.nativeEvent&&window.nativeEvent("+JSONObject.quote(type)+","+payload+")",null);});
    }
    private void message(String type,String value) {JSONObject p=new JSONObject();try{p.put("message",value);}catch(JSONException ignored){}event(type,p);}
    private void error(String scope,String value){JSONObject p=new JSONObject();try{p.put("message",value);p.put("scope",scope);}catch(JSONException ignored){}event("error",p);}
    private void audioState(String type,String value,int id){JSONObject p=new JSONObject();try{p.put("message",value);p.put("sessionId",id);if(type.equals("error"))p.put("scope","audio");}catch(JSONException ignored){}event(type,p);}
    private void playFile(Uri uri,double seconds){
        if(player!=null)player.release();MediaPlayer next=new MediaPlayer();player=next;
        try{next.setDataSource(this,uri);
            next.setOnPreparedListener(p->{if(player!=p||destroyed)return;p.seekTo((long)(Math.max(0,Math.min(seconds,p.getDuration()/1000.0))*1000),MediaPlayer.SEEK_CLOSEST);p.start();message("playback","Playing audio. Starting a take stops playback.");});
            next.setOnCompletionListener(p->{if(player==p){p.release();player=null;message("playback","Playback finished.");}});
            next.setOnErrorListener((p,what,extra)->{if(player==p){p.release();player=null;}error("playback","This audio could not be played. Choose another recording.");return true;});next.prepareAsync();
        }catch(Exception ex){next.release();player=null;error("playback","This audio could not be opened. Choose it again.");}
    }
    private void openExternal(String url) {
        Uri uri=Uri.parse(url);String host=uri.getHost();
        if(!"https".equals(uri.getScheme())||host==null||!(host.equals("imslp.org")||host.endsWith(".imslp.org")||host.equals("www.youtube.com")||host.equals("youtu.be")))return;
        runOnUiThread(()->{if(busy)return;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ex){error("source","No browser is available to open the source.");}});
    }
    public final class Bridge {
        @JavascriptInterface public void start(int minMidi,int maxMidi){
            low=Math.max(24,minMidi);high=Math.min(95,maxMidi);
            runOnUiThread(()->{
                if(busy)return;
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},41);return;}
                begin(null);
            });
        }
        @JavascriptInterface public void stop(){cancelled=true;if(engine!=null)engine.stop();}
        @JavascriptInterface public void stopPlayback(){runOnUiThread(()->{if(player!=null){player.release();player=null;}message("playback","Playback stopped.");});}
        @JavascriptInterface public void stopReplay(){stopPlayback();}
        @JavascriptInterface public void importFile(String kind){
            if(busy)return;importKind=kind;
            runOnUiThread(()->{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES,kind.equals("score")?new String[]{"application/xml","text/xml","application/vnd.recordare.musicxml+xml","application/octet-stream","application/pdf"}:new String[]{"audio/*"});
                startActivityForResult(intent,42);});
        }
        @JavascriptInterface public void openSource(String url){openExternal(url);}
        @JavascriptInterface public void openMicrophoneSettings(){runOnUiThread(()->{
            if(busy)return;try{startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}
            catch(Exception ex){error("settings","Open Android Settings, then Apps, Accelerando, Permissions to enable the microphone.");}
        });}
        @JavascriptInterface public String loadHistory(){return getPreferences(MODE_PRIVATE).getString("history","[]");}
        @JavascriptInterface public boolean hasRecording(String id){return repository.find(id)!=null;}
        @JavascriptInterface public String loadData(String key){return TakeRepository.validKey(key)?getPreferences(MODE_PRIVATE).getString(key,"null"):"null";}
        @JavascriptInterface public boolean saveData(String key,String json){
            if(!TakeRepository.validKey(key)||json==null||json.length()>4_000_000)return false;
            try{if(key.equals("settings"))new JSONObject(json);else{JSONArray a=new JSONArray(json);if(a.length()>(key.equals("history")?500:100))return false;}return getPreferences(MODE_PRIVATE).edit().putString(key,json).commit();}
            catch(JSONException ex){return false;}
        }
        @JavascriptInterface public void replayTake(String id,double seconds){runOnUiThread(()->{
            if(busy){error("playback","Finish the current take before playing audio.");return;}
            File file=repository.find(id);if(file==null){error("playback","This recording is no longer stored. Its report is still available.");return;}
            playFile(Uri.fromFile(file),seconds);
        });}
        @JavascriptInterface public void saveHistory(String json){
            if(json.length()>4_000_000)return;
            try{new JSONArray(json);getPreferences(MODE_PRIVATE).edit().putString("history",json).apply();}catch(JSONException ignored){}
        }
        @JavascriptInterface public void exportHistory(String json){
            if(busy||json.length()>4_000_000)return;
            exportData=json;
            runOnUiThread(()->{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.setType("application/json");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.putExtra(Intent.EXTRA_TITLE,"accelerando-practice.json");startActivityForResult(intent,43);});
        }
    }

    private void begin(byte[] imported) {
        if(busy||destroyed)return;busy=true;cancelled=false;final int sessionId=++sessionSequence;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(player!=null){player.release();player=null;}
        audioState("loading","Loading the on-device pitch model…",sessionId);
        worker.submit(()->{
            try(PitchEngine instance=new PitchEngine(this)){
                engine=instance;instance.lowMidi=low;instance.highMidi=high;
                if(cancelled){busy=false;audioState("cancelled","Take cancelled. Nothing was saved.",sessionId);return;}
                audioState("started",imported==null?"Listening through the tablet microphone":"Analyzing your audio file",sessionId);
                PitchEngine.Listener listener=(time,midi,confidence,rms,ms,clipped)->{
                    JSONObject p=new JSONObject();try{p.put("sessionId",sessionId);p.put("time",time);p.put("midi",midi);p.put("confidence",confidence);p.put("rms",rms);p.put("inferenceMs",ms);p.put("clipped",clipped);}catch(JSONException ignored){}event("frame",p);
                };
                if(imported==null)instance.record(listener);else instance.analyzeWav(imported,listener);
                if(instance.durationSeconds()<=.1){busy=false;audioState("cancelled","Take cancelled. Nothing was saved.",sessionId);return;}
                String recordingId=repository.save(instance,imported);
                JSONObject finished=new JSONObject();finished.put("sessionId",sessionId);finished.put("recordingId",recordingId);finished.put("duration",instance.durationSeconds());
                busy=false;event("stopped",finished);
            }catch(Exception ex){busy=false;audioState("error",ex.getMessage()==null?"Audio analysis failed. Please retry.":ex.getMessage(),sessionId);}
            finally{engine=null;busy=false;runOnUiThread(()->getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));}
        });
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
        super.onRequestPermissionsResult(request,permissions,results);
        if(request==44 && pendingTunerMic!=null){
            if(!busy && results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED)
                pendingTunerMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingTunerMic.deny();
            pendingTunerMic=null;
        }
        if(request==41){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)begin(null);else error("audio","Microphone permission is needed. Tap Microphone settings to enable it, then retry.");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==43&&result==RESULT_OK&&data!=null&&data.getData()!=null){
            try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(exportData.getBytes(java.nio.charset.StandardCharsets.UTF_8));message("reference","Practice log exported.");}
            catch(IOException ex){error("storage","Could not export the practice log.");}return;
        }
        if(request!=42||result!=RESULT_OK||data==null)return;
        final String kind=importKind;final Uri uri=data.getData();
        if(uri==null)return;
        if(kind.equals("reference")){
            playFile(uri,0);return;
        }
        JSONObject reading=new JSONObject();try{reading.put("kind",kind);}catch(JSONException ignored){}event("importing",reading);
        worker.submit(()->{
            try(InputStream in=getContentResolver().openInputStream(uri)){
                int limit=kind.equals("score")?5*1024*1024:25*1024*1024;
                byte[] bytes=readLimited(in,limit);if(bytes.length>limit)throw new IOException("File is too large. Choose a smaller excerpt.");
                if(kind.equals("score")){
                    if(new String(bytes,0,Math.min(bytes.length,4)).equals("%PDF")){error("import","This PDF is a page image. Export matching MusicXML for interactive notes. Automatic scan recognition is not included.");return;}
                    JSONObject p=new JSONObject();p.put("xml",new String(bytes,java.nio.charset.StandardCharsets.UTF_8));event("score",p);
                }else runOnUiThread(()->begin(bytes));
            }catch(Exception ex){error("import",ex.getMessage()==null?"Could not open this file.":ex.getMessage());}
        });
    }
    @Override protected void onPause(){super.onPause();cancelled=true;if(engine!=null)engine.stop();if(player!=null){player.release();player=null;}}
    @Override protected void onDestroy(){destroyed=true;cancelled=true;if(engine!=null)engine.stop();worker.shutdown();web.removeJavascriptInterface("Android");web.destroy();super.onDestroy();}
    @Override public void onBackPressed(){web.evaluateJavascript("window.appBack?window.appBack():false",handled->{if("false".equals(handled))MainActivity.super.onBackPressed();});}
    @Override protected void onStop(){
        super.onStop();
        web.evaluateJavascript("document.querySelector('#tools-page iframe')?.contentWindow.stopPracticeTools?.()",null);
        web.evaluateJavascript("document.querySelector('#game-page iframe')?.contentWindow.stopGame?.()",null);
    }
    static byte[] readLimited(InputStream in,int limit)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] block=new byte[8192];int count;
        while((count=in.read(block,0,Math.min(block.length,limit+1-out.size())))>0){out.write(block,0,count);if(out.size()>limit)break;}
        return out.toByteArray();
    }
}
