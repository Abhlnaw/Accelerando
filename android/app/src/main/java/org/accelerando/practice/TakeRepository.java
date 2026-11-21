package org.accelerando.practice;

import android.content.Context;
import java.io.*;
import java.util.*;

/** App-owned recordings have immutable IDs; an older report cannot replay a new take. */
final class TakeRepository {
    private final File directory;
    TakeRepository(Context context){directory=new File(context.getFilesDir(),"takes");}
    static boolean validKey(String key){return "history".equals(key)||"settings".equals(key)||"library".equals(key);}
    File find(String id){if(id==null||!id.matches("[a-f0-9-]{36}"))return null;File f=new File(directory,id+".wav");return f.isFile()?f:null;}
    synchronized String save(PitchEngine engine)throws IOException{
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Not enough storage to save the recording.");
        String id=UUID.randomUUID().toString();File pending=new File(directory,id+".tmp"),destination=new File(directory,id+".wav");
        try{engine.writeWav(pending);if(!pending.renameTo(destination))throw new IOException("Could not finish saving the recording.");}
        finally{if(pending.exists())pending.delete();}
        File[] files=directory.listFiles((dir,name)->name.matches("[a-f0-9-]{36}\\.wav"));
        if(files!=null){Arrays.sort(files,Comparator.comparingLong(File::lastModified).reversed());for(int i=20;i<files.length;i++)files[i].delete();}
        return id;
    }
}
