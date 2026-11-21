package org.accelerando.practice;

/** YIN normalized difference on a 16 kHz window, used on uncertain CREPE frames. */
final class PeriodicPitch {
    private final double[] signal = new double[512];
    private final double[] difference = new double[246];

    double midi(float[] samples, int low, int high) {
        for (int i = 0; i < signal.length; i++)
            signal[i] = (samples[2*i] + samples[2*i+1]) * .5;
        int last = Math.min(difference.length - 1, (int)Math.ceil(8000 / hz(low)) + 1);
        int first = Math.max(2, (int)Math.floor(8000 / hz(high)));
        int width = signal.length - last;
        double sum = 0;
        for (int lag = 1; lag <= last; lag++) {
            double error = 0;
            for (int i = 0; i < width; i++) {
                double delta = signal[i] - signal[i+lag];
                error += delta * delta;
            }
            sum += error;
            difference[lag] = sum > 0 ? error * lag / sum : 1;
            int center = lag - 1;
            if (center >= first && difference[center] < .12 &&
                difference[center] <= difference[center-1] && difference[center] <= difference[lag]) {
                double a = difference[center-1], b = difference[center], c = difference[lag];
                double curvature = a + c - 2*b;
                double period = center + (curvature > 0 ? .5*(a-c)/curvature : 0);
                double pitch = 69 + 12*Math.log(8000/period/440)/Math.log(2);
                return pitch >= low-.5 && pitch <= high+.5 ? pitch : Double.NaN;
            }
        }
        return Double.NaN;
    }

    private static double hz(int midi) { return 440*Math.pow(2,(midi-69)/12.0); }
}
