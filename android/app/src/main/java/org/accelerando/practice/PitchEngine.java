package org.accelerando.practice;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import ai.onnxruntime.*;
import java.io.*;
import java.nio.FloatBuffer;
import java.util.Collections;

/** Raw microphone samples never leave the device. One model instance per worker. */
final class PitchEngine implements AutoCloseable {
    interface Listener { void frame(double seconds, double midi, double confidence, double rms, double ms, boolean clipped); }
    private final OrtEnvironment environment;
    private final OrtSession session;
    private volatile boolean running;
    private volatile AudioRecord recorder;
    private final float[] window = new float[1024];
    private long samples;
    private int untilFrame;
    private final ByteArrayOutputStream pcm = new ByteArrayOutputStream();
    int lowMidi = 24, highMidi = 95;

    PitchEngine(Context context) throws Exception {
        environment = OrtEnvironment.getEnvironment();
        byte[] model;
        try (InputStream in = context.getAssets().open("crepe-tiny.onnx")) { model = MainActivity.readLimited(in,10*1024*1024); }
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
            options.setIntraOpNumThreads(2);
            options.setInterOpNumThreads(1);
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
            session = environment.createSession(model, options);
        }
    }

    @SuppressWarnings("MissingPermission")
    void record(Listener listener) throws Exception {
        running = true;
        int rate = 48000;
        int minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 48000));
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("Microphone could not initialize. Close other recording apps and retry.");
        short[] chunk = new short[1536];
        try {
            recorder.startRecording();
            int count = 0; float sum = 0;
            while (running && samples < 16000L * 180) {
                int read = recorder.read(chunk, 0, chunk.length, AudioRecord.READ_BLOCKING);
                if (read < 0) { if (!running) break; throw new IOException("Microphone stopped unexpectedly. Please retry."); }
                for (int i=0; i<read; i++) {
                    sum += chunk[i] / 32768f;
                    if (++count == 3) { sample(sum / 3, listener); count = 0; sum = 0; }
                }
            }
        } finally {
            running = false;
            try { recorder.stop(); } catch (IllegalStateException ignored) { }
            recorder.release(); recorder = null;
        }
    }

    void stop() { running = false; }

    void sample(float value, Listener listener) throws Exception {
        System.arraycopy(window, 1, window, 0, 1023);
        window[1023] = value;
        int encoded = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
        pcm.write(encoded & 255); pcm.write((encoded >> 8) & 255);
        samples++;
        if (++untilFrame < 512) return;
        untilFrame = 0;
        double energy = 0; int clipping = 0;
        for (float x : window) { energy += x*x; if (Math.abs(x) >= .99) clipping++; }
        double rms = Math.sqrt(energy/1024), seconds = Math.max(0, (samples-512)/16000.0);
        if (rms < .0015) { listener.frame(seconds, 0, 0, rms, 0, false); return; }
        long start = System.nanoTime();
        try (OnnxTensor input = OnnxTensor.createTensor(environment, FloatBuffer.wrap(window), new long[]{1,1024});
             OrtSession.Result output = session.run(Collections.singletonMap("audio",input))) {
            float[] activations = ((float[][])output.get(0).getValue())[0];
            int peak = 0; float best = -1;
            for (int bin=0; bin<360; bin++) {
                double midi = binToMidi(bin);
                if (midi >= lowMidi-.5 && midi <= highMidi+.5 && activations[bin]>best) { best=activations[bin]; peak=bin; }
            }
            double weight=0, weighted=0;
            for (int bin=Math.max(0,peak-4);bin<=Math.min(359,peak+4);bin++) { weight+=activations[bin];weighted+=bin*activations[bin]; }
            double midi=weight>0?binToMidi(weighted/weight):0;
            boolean clipped=clipping>10;
            listener.frame(seconds,midi,clipped?0:Math.max(0,best),rms,(System.nanoTime()-start)/1e6,clipped);
        }
    }

    static double binToMidi(double bin) {
        double hz = 10 * Math.pow(2, (1997.3794084376191 + 20 * bin)/1200);
        return 69 + 12 * Math.log(hz/440)/Math.log(2);
    }

    void writeWav(File file) throws IOException {
        byte[] data=pcm.toByteArray();
        try (FileOutputStream out=new FileOutputStream(file)) {
            out.write("RIFF".getBytes()); le(out,data.length+36,4); out.write("WAVEfmt ".getBytes()); le(out,16,4);
            le(out,1,2); le(out,1,2); le(out,16000,4); le(out,32000,4); le(out,2,2); le(out,16,2);
            out.write("data".getBytes()); le(out,data.length,4); out.write(data);
        }
    }
    private static void le(OutputStream out,int n,int bytes) throws IOException { for(int i=0;i<bytes;i++)out.write((n>>(8*i))&255); }

    /** PCM16 WAV import, including stereo; preserve source seconds when resampling. */
    void analyzeWav(byte[] data, Listener listener) throws Exception {
        if(data.length<44 || !new String(data,0,4).equals("RIFF") || !new String(data,8,4).equals("WAVE"))
            throw new IOException("Upload an uncompressed 16-bit PCM WAV recording.");
        int rate=0,channels=0,bits=0,format=0,offset=0,length=0;
        for(int p=12;p+8<=data.length;) {
            int size=integer(data,p+4,4); if(size<0||size>data.length-p-8)throw new IOException("Incomplete WAV file.");
            String id=new String(data,p,4);
            if(id.equals("fmt ")&&size>=16){format=integer(data,p+8,2);channels=integer(data,p+10,2);rate=integer(data,p+12,4);bits=integer(data,p+22,2);}
            if(id.equals("data")){offset=p+8;length=size;}
            p+=8+size+(size&1);
        }
        if(format!=1||bits!=16||channels<1||channels>2||rate<8000||rate>96000||length==0)
            throw new IOException("Export as a mono or stereo 16-bit PCM WAV, 8–96 kHz.");
        int frames=length/(2*channels);
        if(frames/(double)rate>180)throw new IOException("Trim the recording to 3 minutes or less.");
        running=true;
        for(int i=0;i<(long)frames*16000/rate&&running;i++) {
            double position=i*rate/16000.0;int a=(int)position,b=Math.min(a+1,frames-1);float va=0,vb=0;
            for(int c=0;c<channels;c++) {va+=(short)integer(data,offset+2*(a*channels+c),2)/32768f/channels;vb+=(short)integer(data,offset+2*(b*channels+c),2)/32768f/channels;}
            sample((float)(va+(vb-va)*(position-a)),listener);
        }
        running=false;
    }
    private static int integer(byte[] b,int p,int count) {int n=0;for(int j=0;j<count;j++)n|=(b[p+j]&255)<<(8*j);return n;}
    @Override public void close() throws OrtException { session.close(); }
}
