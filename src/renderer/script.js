const CARD_TYPES = {
    '99_histoires': { folder: '法国99个故事', count: 99, label: '99 Histoires', ico: '📖', type: 'histoires'},
    '150_histoires': { folder: '法国新的1-150个故事', count: 150, label: '150 Histoires', ico: '📚', type: 'histoires'},
    '99_musiques': { folder: '法国99个故事', count: 99, label: '99 Musiques', ico: '🎵', type: 'musiques'},
    '150_musiques': { folder: '法国新的1-150个故事', count: 150, label: '150 Musiques', ico: '🎶', type: 'musiques'},
}

const STEPS = [
    { ico: '📥', lbl: 'Téléchargement du fichier' },
    { ico: '📦', lbl: "Décompression" },
    { ico: '💾', lbl: 'Formatage de la carte SD' },
    { ico: '📋', lbl: 'Copie des fichiers' },
    { ico: '🧹', lbl: 'Nettoyage des téléchargements' },
]

let paypalUrl = 'https://paypal.me/Zarhkoh'
let langues = {}   // reçu depuis main.js via props
let currentDrives = []

    ; (async () => {
        const p = await api.getProps()
        if (p.paypal) paypalUrl = p.paypal
        if (p.langues) langues = p.langues

        buildLangPills()
        updateCardTypes()          // appliquer la langue par défaut
        buildStepsList()
        await refreshSD()
        api.onPipeline(onPipelineUpdate)
    })()


function buildLangPills() {
    const container = document.getElementById('lang-pills')
    const codes = Object.keys(langues)

    container.innerHTML = codes.map((code, i) => {
        const lang = langues[code]
        return `<label class="pill">
      <input type="radio" name="lang" value="${code}" ${i === 0 ? 'checked' : ''}
             onchange="updateCardTypes()">
      <span class="pill-in">${lang.label}</span>
    </label>`
    }).join('')
}


function updateCardTypes() {
    const code = document.querySelector('input[name="lang"]:checked')?.value
    const lang = langues[code] || {}
    const grid = document.getElementById('ctype-grid')
    const hint = document.getElementById('avail-hint')

    // Calculer quels types sont disponibles
    const available = {
        '99_histoires': lang.histoires !== null && lang.histoires !== undefined,
        '150_histoires': lang.histoires === 150,
        '99_musiques': lang.musiques !== null && lang.musiques !== undefined,
        '150_musiques': lang.musiques === 150,
    }

    // Reconstruire la grille
    grid.innerHTML = Object.entries(CARD_TYPES).map(([key, ct]) => {
        const ok = available[key]
        const disClass = ok ? '' : ' rcard-disabled'
        const sub = ct.count==150? 'Pour les enceintes après 2022' : 'Pour toutes les enceintes'
        return `<label class="rcard${disClass}">
      <input type="radio" name="ctype" value="${key}" ${!ok ? 'disabled' : ''}>
      <div class="rcard-in">
        <div class="rcard-title">${ct.ico}&nbsp; ${ct.label}</div>
        <div class="rcard-sub">${ok ? sub : '— Non disponible'}</div>
      </div>
    </label>`
    }).join('')

    const firstAvail = grid.querySelector('input[type=radio]:not([disabled])')
    if (firstAvail) firstAvail.checked = true
}


function buildStepsList() {
    const container = document.getElementById('steps-list')
    container.innerHTML = STEPS.map((s, i) => `
      <div class="step-acc" id="sa-${i}">
        <div class="step-head">
          <div class="step-head-left">
            <span class="step-n">${String(i + 1).padStart(2, '0')}</span>
            <span class="step-ico">${s.ico}</span>
            <span class="step-lbl">${s.lbl}</span>
          </div>
          <span class="step-st" id="ss-${i}">◌</span>
        </div>
        <div class="step-body" id="sb-${i}">
          <div class="step-body-bar-bg">
            <div class="step-body-bar-fill" id="sb-bar-${i}"></div>
          </div>
          <div class="step-body-detail" id="sb-detail-${i}"></div>
        </div>
      </div>
    `).join('')
}


async function refreshSD() {
    const sel = document.getElementById('sd-select')
    currentDrives = await api.listSD()
    sel.innerHTML = ''
    if (!currentDrives.length) {
        sel.innerHTML = '<option value="">Aucune carte SD détectée</option>'
        updateSDInfo()
        return
    }
    currentDrives.forEach(d => {
        const o = document.createElement('option')
        o.value = d.path
        // construit l'affichage : lettre (Windows) ou basename, nom du volume, et used/total si dispo
        let labelParts = []
        if (d.letter) labelParts.push(d.letter + (d.letter.length === 1 ? ':' : ''))
        if (d.label) labelParts.push(d.label)
        const text = labelParts.length ? labelParts.join(' — ') : (d.display || d.path)
        o.textContent = text
        sel.appendChild(o)
    })
    updateSDInfo()
}

function updateSDInfo() {
    const sel = document.getElementById('sd-select')
    const infoWrap = document.getElementById('sd-info')
    const bar = document.getElementById('sd-info-bar')
    const txt = document.getElementById('sd-info-text')

    const drive = currentDrives.find(d => d.path === sel.value)
    if (!drive || !drive.total) {
        infoWrap.style.display = 'none'
        return
    }

    infoWrap.style.display = 'block'
    const pct = Math.round((drive.used / drive.total) * 100)
    bar.style.width = pct + '%'
    txt.textContent = `${humanSize(drive.used)} utilisés sur ${humanSize(drive.total)} (${pct}%)`
}



function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== id))
}

function goBack() {
    showPage('pg-select')
    document.getElementById('start-btn').disabled = false
    document.getElementById('start-btn').innerHTML = '▶&nbsp; Créer la carte SD'
    resetProgression()
}

function resetProgression() {
    // reset accordéon
    STEPS.forEach((_, i) => {
        const acc = document.getElementById('sa-' + i)
        const st  = document.getElementById('ss-' + i)
        const bar = document.getElementById('sb-bar-' + i)
        const det = document.getElementById('sb-detail-' + i)

        if (acc) acc.className = 'step-acc'
        if (st)  st.textContent = '◌'
        if (bar) setBar(bar.id, 0)
        if (det) det.textContent = ''
    })

    setBar('total-bar', 0)
    document.getElementById('total-pct').textContent = '0%'
    document.getElementById('prog-title').textContent = 'Création en cours…'
    document.getElementById('prog-subtitle').textContent = 'Étape 1/5'
    document.getElementById('success-screen').style.display = 'none'
    document.getElementById('err-screen').style.display = 'none'
    document.getElementById('steps-list').style.display = 'flex'
    document.getElementById('footer-prog').style.display = 'none'
    document.querySelector('.prog-header').style.display = ''
    document.querySelector('.total-bar-wrap').style.display = ''
}

function showFormatConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-overlay')
        const textEl  = document.getElementById('confirm-text')
        const btnOk   = document.getElementById('confirm-ok')
        const btnCancel = document.getElementById('confirm-cancel')

        if (message) textEl.textContent = message

        const cleanup = () => {
            overlay.classList.add('hidden')
            btnOk.onclick = null
            btnCancel.onclick = null
        }

        btnOk.onclick = () => {
            cleanup()
            resolve(true)
        }
        btnCancel.onclick = () => {
            cleanup()
            resolve(false)
        }

        overlay.classList.remove('hidden')
    })
}


async function startPipeline() {
    const sdPath = document.getElementById('sd-select').value
    const ctInput = document.querySelector('input[name="ctype"]:checked')

    if (!sdPath) { showAlert('Veuillez sélectionner une carte SD.'); return }
    if (!ctInput) { showAlert('Veuillez sélectionner un type de carte.'); return }

    const cardKey = ctInput.value
    const info = CARD_TYPES[cardKey]
    const langCode = document.querySelector('input[name="lang"]:checked').value

    const ok = await showFormatConfirm(
    `Les données de votre carte SD seront effacées afin de créer une carte ${info.label}. 
Confirmez-vous ?`
)
    if (!ok) return

    document.getElementById('start-btn').disabled = true
    document.getElementById('start-btn').innerHTML = '<span class="spin">◐</span>&nbsp; Préparation…'

    resetProgression()
    showPage('pg-prog')

    const result = await api.createSD({ sdPath, cardTypeKey: info.type, folderName: info.folder, fileCount: info.count, langCode })

    if (result.success) {
        document.getElementById('steps-list').style.display = 'none'
        document.getElementById('success-screen').style.display = 'flex'
        document.getElementById('footer-prog').style.display = 'flex'
        document.querySelector('.prog-header').style.display = 'none'
        document.querySelector('.total-bar-wrap').style.display = 'none'
        document.querySelector('.cur-step').style.display = 'none'
    } else {
        document.getElementById('steps-list').style.display = 'none'
        document.getElementById('err-msg').textContent = 'Erreur : ' + result.error
        document.getElementById('err-screen').style.display = 'block'
        document.getElementById('start-btn').disabled = false
        document.getElementById('start-btn').innerHTML = '▶&nbsp; Créer la carte SD'
    }
}

function onPipelineUpdate({ step, state, detail, stepPct }) {
    const acc = document.getElementById('sa-' + step)
    const st  = document.getElementById('ss-' + step)
    const bar = document.getElementById('sb-bar-' + step)
    const det = document.getElementById('sb-detail-' + step)

    // état (couleur + icône)
    if (acc) {
        acc.classList.remove('active', 'done', 'error', 'open')
        if (state === 'active') {
            acc.classList.add('active', 'open')
        } else if (state === 'done') {
            acc.classList.add('done')
        } else if (state === 'error') {
            acc.classList.add('error', 'open')
        }
    }

    if (st) {
        st.textContent = { pending: '◌', active: '◐', done: '•', error: '✗' }[state] || '◌'
    }

    // sous‑titre global
    document.getElementById('prog-subtitle').textContent = `Étape ${step + 1} / 7`

    // mise à jour contenu de l’étape
    if (state === 'active') {
        if (det && detail) det.textContent = detail
        if (bar && stepPct !== null) setBar(bar.id, stepPct)

        // on ferme les autres étapes
        STEPS.forEach((_, i) => {
            if (i === step) return
            const other = document.getElementById('sa-' + i)
            if (other) other.classList.remove('open', 'active')
        })

        // scroll vers l’étape en cours
        if (acc) acc.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }

    if (state === 'done') {
        if (bar) setBar(bar.id, 100)
        const pct = Math.round((step + 1) / 7 * 100)
        setBar('total-bar', pct)
        document.getElementById('total-pct').textContent = pct + '%'
    }
}



function setBar(id, pct) { document.getElementById(id).style.width = Math.min(100, pct) + '%' }
function showAlert(msg) {
    const el = document.getElementById('alert-sel')
    el.textContent = msg; el.className = 'alert err show'
}
function openPaypal() { api.openUrl(paypalUrl) }

function humanSize(bytes) {
    if (!bytes && bytes !== 0) return '—'
    const thresh = 1024
    if (Math.abs(bytes) < thresh) return bytes + ' B'
    const units = ['Ko','Mo','Go','To']
    let u = -1
    do {
        bytes /= thresh
        ++u
    } while (Math.abs(bytes) >= thresh && u < units.length - 1)
    return bytes.toFixed(bytes >= 100 ? 0 : 1) + ' ' + units[u]
}
