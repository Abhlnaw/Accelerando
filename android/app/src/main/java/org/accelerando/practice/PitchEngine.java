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
    private volatile boolean running=true;
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
        if(!running)return;
        int rate = 48000;
        int minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 48000));
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {recorder.release();recorder=null;throw new IOException("Microphone could not initialize. Close other recording apps and retry.");}
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
    double durationSeconds(){return samples/16000.0;}

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
        WavInput input=WavInput.parse(data);
        if(!running)return;
        for(int i=0;i<input.samples16k()&&running;i++)sample(input.sample16k(i),listener);
        running=false;
    }
    @Override public void close() throws OrtException { session.close(); }
}
