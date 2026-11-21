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
    private WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile PitchEngine engine;
    private volatile boolean busy=false;
    private String importKind="score";
    private int low=24,high=95;
    private MediaPlayer player;
    private File recording;
    private boolean destroyed;
    private String exportData="";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff251a15);
        getWindow().setNavigationBarColor(0xff251a15);
        web=new WebView(this);setContentView(web);
        web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
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
                if("appassets.androidplatform.net".equals(request.getUrl().getHost()))return false;
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
    private void openExternal(String url) {
        Uri uri=Uri.parse(url);String host=uri.getHost();
        if(!"https".equals(uri.getScheme())||host==null||!(host.equals("imslp.org")||host.endsWith(".imslp.org")||host.equals("www.youtube.com")||host.equals("youtu.be")))return;
        runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ex){message("error","No browser is available to open the source.");}});
    }
    private final class Bridge {
        @JavascriptInterface public void start(int minMidi,int maxMidi){
            low=Math.max(24,minMidi);high=Math.min(95,maxMidi);
            runOnUiThread(()->{
                if(busy)return;
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},41);return;}
                begin(null);
            });
        }
        @JavascriptInterface public void stop(){if(engine!=null)engine.stop();}
        @JavascriptInterface public void importFile(String kind){
            if(busy)return;importKind=kind;
            runOnUiThread(()->{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES,kind.equals("score")?new String[]{"application/xml","text/xml","application/vnd.recordare.musicxml+xml","application/octet-stream","application/pdf"}:new String[]{"audio/*"});
                startActivityForResult(intent,42);});
        }
        @JavascriptInterface public void openSource(String url){openExternal(url);}
        @JavascriptInterface public void replay(double seconds){runOnUiThread(()->{
            if(recording==null||!recording.isFile()){message("error","Finish a take before replaying it.");return;}
            try{if(player!=null)player.release();player=new MediaPlayer();player.setDataSource(recording.getAbsolutePath());player.prepare();player.seekTo((int)(Math.max(0,seconds)*1000));player.start();}
            catch(Exception ex){message("error","Could not replay the recording.");}
        });}
        @JavascriptInterface public String loadHistory(){return getPreferences(MODE_PRIVATE).getString("history","[]");}
        @JavascriptInterface public void saveHistory(String json){
            if(json.length()>2_000_000)return;
            try{new JSONArray(json);getPreferences(MODE_PRIVATE).edit().putString("history",json).apply();}catch(JSONException ignored){}
        }
        @JavascriptInterface public void exportHistory(String json){
            if(json.length()>2_000_000)return;
            exportData=json;
            runOnUiThread(()->{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.setType("application/json");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.putExtra(Intent.EXTRA_TITLE,"accelerando-practice.json");startActivityForResult(intent,43);});
        }
    }

    private void begin(byte[] imported) {
        if(busy)return;busy=true;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(player!=null){player.release();player=null;}
        message("loading","Loading the on-device pitch model…");
        worker.submit(()->{
            try(PitchEngine instance=new PitchEngine(this)){
                engine=instance;instance.lowMidi=low;instance.highMidi=high;
                message("started",imported==null?"Listening through the tablet microphone":"Analyzing your audio file");
                PitchEngine.Listener listener=(time,midi,confidence,rms,ms,clipped)->{
                    JSONObject p=new JSONObject();try{p.put("time",time);p.put("midi",midi);p.put("confidence",confidence);p.put("rms",rms);p.put("inferenceMs",ms);p.put("clipped",clipped);}catch(JSONException ignored){}event("frame",p);
                };
                if(imported==null)instance.record(listener);else instance.analyzeWav(imported,listener);
                recording=new File(getFilesDir(),"last-take.wav");instance.writeWav(recording);
                message("stopped","Take saved on this tablet");
            }catch(Exception ex){message("error",ex.getMessage()==null?"Audio analysis failed. Please retry.":ex.getMessage());}
            finally{engine=null;busy=false;runOnUiThread(()->getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));}
        });
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
        super.onRequestPermissionsResult(request,permissions,results);
        if(request==41){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)begin(null);else message("error","Microphone permission is needed. Tap Start and allow audio recording.");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==43&&result==RESULT_OK&&data!=null&&data.getData()!=null){
            try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(exportData.getBytes(java.nio.charset.StandardCharsets.UTF_8));message("reference","Practice log exported.");}
            catch(IOException ex){message("error","Could not export the practice log.");}return;
        }
        if(request!=42||result!=RESULT_OK||data==null)return;
        final String kind=importKind;final Uri uri=data.getData();
        if(uri==null)return;
        if(kind.equals("reference")){
            try{if(player!=null)player.release();player=new MediaPlayer();player.setDataSource(this,uri);player.prepare();player.start();message("reference","Playing your reference. Stop it before a microphone take.");}
            catch(Exception ex){message("error","Could not play this reference audio.");}return;
        }
        worker.submit(()->{
            try(InputStream in=getContentResolver().openInputStream(uri)){
                int limit=kind.equals("score")?5*1024*1024:25*1024*1024;
                byte[] bytes=readLimited(in,limit);if(bytes.length>limit)throw new IOException("File is too large. Choose a smaller excerpt.");
                if(kind.equals("score")){
                    if(new String(bytes,0,Math.min(bytes.length,4)).equals("%PDF")){message("error","This PDF is a page image. Export matching MusicXML for interactive notes, or open it in a PDF viewer. Automatic scan recognition is not included.");return;}
                    JSONObject p=new JSONObject();p.put("xml",new String(bytes,java.nio.charset.StandardCharsets.UTF_8));event("score",p);
                }else runOnUiThread(()->begin(bytes));
            }catch(Exception ex){message("error",ex.getMessage()==null?"Could not open this file.":ex.getMessage());}
        });
    }
    @Override protected void onPause(){super.onPause();if(engine!=null)engine.stop();if(player!=null){player.release();player=null;}}
    @Override protected void onDestroy(){destroyed=true;if(engine!=null)engine.stop();worker.shutdown();web.destroy();super.onDestroy();}
    static byte[] readLimited(InputStream in,int limit)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] block=new byte[8192];int count;
        while((count=in.read(block,0,Math.min(block.length,limit+1-out.size())))>0){out.write(block,0,count);if(out.size()>limit)break;}
        return out.toByteArray();
    }
}
