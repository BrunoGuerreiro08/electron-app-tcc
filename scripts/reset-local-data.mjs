// electron/scripts/resetLocalData.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const APP_NAME = 'Docenti' 

function getActualUserDataPath() {
    const home = os.homedir()
    switch (process.platform) {
        case 'win32':
            return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_NAME)
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', APP_NAME)
        case 'linux':
            return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_NAME)
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

const userDataPath = getActualUserDataPath()

console.log(`Wiping local app data at:\n  ${userDataPath}`)

try {
    if (fs.existsSync(userDataPath)) {
        fs.rmSync(userDataPath, { recursive: true, force: true })
        console.log('Done — local data wiped.')
    } else {
        console.log('Path does not exist, nothing to wipe.')
    }
} catch (err) {
    console.error('Failed to wipe directory. Make sure the Electron app is completely closed!', err)
}