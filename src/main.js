/**
 * main.js — Processus principal Electron
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const { File } = require('megajs')

const props = require('./properties')

// ─── Fenêtre ──────────────────────────────────────────────────────────────────

let win

function createWindow() {
  win = new BrowserWindow({
    width: 580, height: 600,
    minWidth: 560, minHeight: 580,
    resizable: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: false,
    backgroundColor: '#0C0E13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  // win.webContents.openDevTools()
}

app.whenReady().then(createWindow).catch(err => {
  require('fs').writeFileSync('crash.log', err.toString())
})
app.on('window-all-closed', () => app.quit())
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('props:get', () => ({
  paypal: props.paypal,
  // On n'envoie que ce dont le renderer a besoin (pas les URLs)
  langues: Object.fromEntries(
    Object.entries(props.langues).map(([code, l]) => [code, {
      label: l.label,
      histoires: l.histoires,
      musiques: l.musiques,
    }])
  ),
}))

ipcMain.handle('sd:list', async () => {
  const plat = process.platform
  try {
    if (plat === 'win32') {
      // On demande DeviceID, VolumeName, Size, FreeSpace (bytes)
      const { stdout } = await execAsync('wmic logicaldisk where drivetype=2 get DeviceID,VolumeName,Size,FreeSpace /format:csv')
      const lines = stdout.trim().split('\n').slice(2).filter(Boolean)
      return lines.map(l => {
        const parts = l.trim().split(',')
        // format CSV wmic: Node,DeviceID,FreeSpace,Size,VolumeName (depends on env) -> find numbers heuristically
        // We try to read at least DeviceID,Size,FreeSpace,VolumeName robustement:
        const emplacement = parts.find(p => /^[A-Z]:$/.test(p)) || parts[1] || ''
        const totalSize = Number(parts[3])
        const freespace = Number(parts[2])
        const vol = String(parts[4]) || 'Carte SD'
        const total = totalSize || 0
        const used = total > 0 ? (total - (freespace)) : 0
        const path = emplacement ? emplacement + '\\' : ''
        const display = `${emplacement} — ${vol}${ total ? ` — ${fmt(used)} / ${fmt(total)}` : ` — ${vol}` }`
        return { path, letter: emplacement.replace(':',''), label: vol || 'SD Card', used, total, display }
      }).filter(d => d.path && d.path.length > 2)
    }

    if (plat === 'darwin') {
      // Liste des volumes montés dans /Volumes puis utiliser 'df -k' pour tailles
      const { stdout } = await execAsync('ls /Volumes')
      const vols = stdout.trim().split('\n').filter(v => v && v !== 'Macintosh HD')
      const results = []
      // get df output once
      const { stdout: dfout } = await execAsync('df -kP')
      const dfLines = dfout.trim().split('\n').slice(1)
      for (const v of vols) {
        const mount = `/Volumes/${v}`
        // chercher la ligne df correspondant au mount
        const dfLine = dfLines.find(l => l.endsWith(` ${mount}`) || l.split(/\s+/).pop() === mount)
        let total = 0, used = 0
        if (dfLine) {
          const parts = dfLine.split(/\s+/)
          // df -kP: filesystem size(kB) used(kB) available(kB) ...
          const sizeKB = Number(parts[1] || 0)
          const usedKB = Number(parts[2] || 0)
          total = sizeKB * 1024
          used = usedKB * 1024
        }
        results.push({ path: mount, letter: v, label: v, used, total, display: `${v} — ${fmt(used)} / ${fmt(total)}` })
      }
      return results
    }

    // Linux / others: utiliser lsblk JSON et df fallback
    {
      // try lsblk for mountpoint,size
      try {
        const { stdout } = await execAsync('lsblk -b -o MOUNTPOINT,SIZE -J')
        const data = JSON.parse(stdout)
        const mounts = []
        const walk = (dev) => {
          if (dev.mountpoint) mounts.push({ mountpoint: dev.mountpoint, size: Number(dev.size || 0) })
          ;(dev.children || []).forEach(walk)
        }
        ;(data.blockdevices || []).forEach(walk)
        // enrich with used via df -B1 -P
        const { stdout: dfout } = await execAsync('df -B1 -P')
        const dfLines = dfout.trim().split('\n').slice(1)
        return mounts
          .filter(m => m.mountpoint && m.mountpoint !== '/')
          .map(m => {
            const dfLine = dfLines.find(l => l.split(/\s+/).pop() === m.mountpoint)
            let used = 0, total = m.size || 0
            if (dfLine) {
              const p = dfLine.split(/\s+/)
              // df -B1 -P: filesystem 1-blocks Used Available ...
              used = Number(p[2] || 0)
              total = Number(p[1] || total)
            }
            const label = path.basename(m.mountpoint)
            return { path: m.mountpoint, letter: label, label, used, total, display: `${m.mountpoint} — ${label} — ${fmt(used)} / ${fmt(total)}` }
          })
      } catch (e) {
        // fallback simple: attempt findmnt JSON like before (original code)
        const { stdout } = await execAsync('lsblk -o MOUNTPOINT,HOTPLUG,LABEL -J')
        const data = JSON.parse(stdout)
        const results = []
        const walk = (dev) => {
          if (dev.hotplug === '1' && dev.mountpoint)
            results.push({ path: dev.mountpoint, label: dev.label || 'SD Card', used: 0, total: 0, display: `${dev.mountpoint} — ${dev.label || 'SD Card'}` })
          ;(dev.children || []).forEach(walk)
        }
        ;(data.blockdevices || []).forEach(walk)
        return results
      }
    }
  } catch (e) { console.error('sd:list error', e); return [] }
})


ipcMain.on('open:url', (_, url) => shell.openExternal(url))
ipcMain.on('window:minimize', () => win.minimize())
ipcMain.on('window:close', () => win.close())

ipcMain.handle('sd:create', async (event, { sdPath, cardTypeKey, folderName, fileCount, langCode }) => {
  const send = (step, state, detail = '', stepPct = null) =>
    event.sender.send('pipeline:update', { step, state, detail, stepPct })

  const langConfig = props.langues[langCode]
  if (!langConfig)
    return { success: false, error: `Langue inconnue : "${langCode}".` }
  const url = (langConfig.urls || {})[cardTypeKey] || ''

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-creator-'))
  const zipPath = path.join(tmpDir, 'pack.zip')
  const extractDir = path.join(tmpDir, 'extracted')

  try {
    // 1. Téléchargement
    send(0, 'active', 'Téléchargement des fichiers audio...', 0)

    if (!url || !url.includes('mega.nz')) {
      throw new Error('URL invalide ou manquante pour cette langue / ce type de carte.')
    }

    await downloadFromMega(url, zipPath, (loaded, total) => {
      if (total) {
        const pct = Math.round(loaded / total * 100)
        send(0, 'active', `${pct}% — ${fmt(loaded)} / ${fmt(total)}`, pct)
      }
    })

    const size = fs.statSync(zipPath).size
    send(0, 'done', `${fmt(size)} téléchargés`, 100)


    // 2. Décompression
    send(1, 'active', 'Décompression du téléchargement...', 0)
    const extractZip = require('extract-zip')
    fs.mkdirSync(extractDir, { recursive: true })
    await extractZip(zipPath, { dir: extractDir })
    send(1, 'done', '', 100)

    // 3. Formatage
    send(2, 'active', 'Formatage de la carte SD...', 0)
    await formatSD(sdPath)
    send(2, 'done', '', 100)


    // 4. Copie
    send(3, 'active', 'Inventaire...', 0)
    fs.mkdirSync(path.join(sdPath, folderName), { recursive: true })

    const allFiles = getAllFiles(extractDir).slice(0, fileCount).sort()
    for (let i = 0; i < allFiles.length; i++) {
      fs.copyFileSync(allFiles[i], path.join(sdPath, folderName, path.basename(allFiles[i])))
      send(3, 'active', `${i + 1} / ${fileCount} — ${path.basename(allFiles[i])}`, Math.round((i + 1) / fileCount * 100))
    }
    send(3, 'done', `${allFiles.length} fichiers copiés`, 100)

    // 5. Nettoyage
    send(4, 'active', 'Suppression des fichiers temporaires...', 0)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    send(4, 'done', '', 100)

    await ejectSD(sdPath)

    return { success: true }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { success: false, error: err.message }
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function downloadFromMega(url, destPath, progressCb) {
  const file = File.fromURL(url)

  await new Promise((resolve, reject) => {
    file.loadAttributes(err => {
      if (err) return reject(err)

      const total = file.size || 0
      let loaded = 0

      const writeStream = fs.createWriteStream(destPath)

      file.download()
        .on('data', chunk => {
          loaded += chunk.length
          if (progressCb && total) progressCb(loaded, total)
        })
        .on('error', reject)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject)
    })
  })
}

function fmt(bytes) { return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${(bytes / 1024).toFixed(0)} Ko` }
function getAllFiles(dir) {
  const r = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : r.push(f) } }
  walk(dir); return r.sort()
}
async function formatSD(sdPath) {
  const plat = process.platform
  if (plat === 'win32') {
    await execAsync(`format ${sdPath.replace(/\\/g, '').replace('/', '').slice(0, 2)} /FS:FAT32 /Q /Y`, { timeout: 120000 })
  } else if (plat === 'darwin') {
    const { stdout } = await execAsync(`diskutil info -plist "${sdPath}"`)
    const m = stdout.match(/<key>DeviceIdentifier<\/key>\s*<string>([^<]+)<\/string>/)
    await execAsync(`diskutil eraseDisk FAT32 SDCARD /dev/${m ? m[1] : ''}`, { timeout: 120000 })
  } else {
    const { stdout } = await execAsync(`findmnt -n -o SOURCE "${sdPath}"`)
    const dev = stdout.trim()
    await execAsync(`umount "${sdPath}"`)
    await execAsync(`mkfs.vfat -F 32 "${dev}"`, { timeout: 120000 })
    await execAsync(`mount "${dev}" "${sdPath}"`)
  }
}
async function ejectSD(sdPath) {
  try {
    const plat = process.platform
    if (plat === 'win32') await execAsync(`powershell -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName('${sdPath}').InvokeVerb('Eject')"`)
    else if (plat === 'darwin') await execAsync(`diskutil eject "${sdPath}"`)
    else await execAsync(`eject "${sdPath}" || umount "${sdPath}"`)
  } catch (_) { }
}
