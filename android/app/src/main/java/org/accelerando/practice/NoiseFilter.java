package org.accelerando.practice;

import java.util.Arrays;

/** Conservative detail shrinkage on the model window. Leave low frequencies and replay PCM intact. */
final class NoiseFilter {
    private final float[] details=new float[512];
    void clean(float[] frame){
        // Median adjacent-sample difference estimates broadband noise without relying on a silent lead-in.
        for(int i=0;i<details.length;i++)details[i]=Math.abs(frame[2*i]-frame[2*i+1])*.5f;
        Arrays.sort(details);
        float floor=details[details.length/2];
        for(int span=1;span<=4;span*=2){
            for(int start=0;start<frame.length;start+=2*span){
                float diff=0;
                for(int j=0;j<span;j++)diff+=frame[start+j]-frame[start+span+j];
                diff/=2*span;
                // Preserve attacks and cap attenuation even for weak overtones.
                float reduction=Math.copySign(Math.min(Math.abs(diff)*.50f,floor/span),diff);
                for(int j=0;j<span;j++){frame[start+j]-=reduction;frame[start+span+j]+=reduction;}
            }
        }
    }
}
