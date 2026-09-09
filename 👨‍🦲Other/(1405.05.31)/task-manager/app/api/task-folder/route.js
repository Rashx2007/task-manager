// task-folder/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';
const clean = (s) => String(s || '').replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const t = await query(`SELECT tsk.TaskTtl, at.AssetID, a.FolderPath AS AssetFolder FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl at ON tsk.TaskID=at.TaskID LEFT JOIN Asset_2_tbl a ON at.AssetID=a.AssetID WHERE tsk.TaskID=?`, [taskId]);
    const f = await query(`SELECT FolderPath FROM Folder_tbl WHERE TaskID=?`, [taskId]);
    const assetId = t.length ? (t[0].AssetID || null) : null;
    const assetFolder = t.length ? (t[0].AssetFolder || '') : '';
    let subPath = '';
    if (assetFolder) {
      const marker = `#${taskId}`;
      let existing = null;
      try { const hit = fs.readdirSync(assetFolder, { withFileTypes: true }).find((d) => d.isDirectory() && d.name.includes(marker)); if (hit) existing = path.join(assetFolder, hit.name); } catch {}
      if (existing) subPath = existing;
      else { subPath = path.join(assetFolder, `#${taskId} ${clean(t[0].TaskTtl)}`.trim()); try { if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true }); } catch {} }
    }
    return NextResponse.json({ success: true, assetId, assetFolder, subPath, existingFolder: f.length ? (f[0].FolderPath || '') : '' });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}