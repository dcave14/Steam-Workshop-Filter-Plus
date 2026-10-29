// build.js
// Packages the extension for the Chrome Web Store and for Firefox Add-ons
// (AMO) from the same source files, so the two versions cannot drift apart.
//
// Usage: node build.js
//   dist/chrome/   and dist/Steam-Workshop-Filter-Plus-<version>-chrome.zip
//   dist/firefox/  and dist/Steam-Workshop-Filter-Plus-<version>-firefox.zip
//
// The package holds exactly the files manifest.json references. The Firefox
// manifest is the Chrome one plus browser_specific_settings.gecko:
//   - id: the add-on's permanent AMO identity (keep it the same forever once
//     published, or Firefox treats it as a different add-on)
//   - strict_min_version 140.0: data_collection_permissions needs Firefox
//     140+ (Android 142+); everything else used ("world": "MAIN" for
//     hydration-signal.js, :has(), CSS zoom) works from Firefox 128
//   - data_collection_permissions: required by AMO for new add-ons; "none"
//     because nothing is sent to the developer or third parties (the only
//     request goes to Steam itself, see the privacy policy)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const GECKO = {
    id: 'steam-workshop-filter-plus@dcave14',
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] }
};

function manifestFiles(manifest) {
    const files = new Set(['manifest.json']);
    for (const script of manifest.content_scripts || []) {
        for (const f of script.js || []) files.add(f);
        for (const f of script.css || []) files.add(f);
    }
    for (const f of Object.values(manifest.icons || {})) files.add(f);
    return [...files];
}

// Minimal zip writer (deflate, no external dependency). Entries are written
// at the zip root with forward-slash names, as both stores expect.
function writeZip(outFile, entries) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const crc = zlib.crc32(data);
        const head = Buffer.alloc(30);
        head.writeUInt32LE(0x04034b50, 0);
        head.writeUInt16LE(20, 4);
        head.writeUInt16LE(0x0800, 6);
        head.writeUInt16LE(8, 8);
        head.writeUInt32LE(0, 10);
        head.writeUInt32LE(crc >>> 0, 14);
        head.writeUInt32LE(deflated.length, 18);
        head.writeUInt32LE(data.length, 22);
        head.writeUInt16LE(nameBuf.length, 26);
        head.writeUInt16LE(0, 28);
        local.push(head, nameBuf, deflated);

        const dir = Buffer.alloc(46);
        dir.writeUInt32LE(0x02014b50, 0);
        dir.writeUInt16LE(20, 4);
        dir.writeUInt16LE(20, 6);
        dir.writeUInt16LE(0x0800, 8);
        dir.writeUInt16LE(8, 10);
        dir.writeUInt32LE(0, 12);
        dir.writeUInt32LE(crc >>> 0, 16);
        dir.writeUInt32LE(deflated.length, 20);
        dir.writeUInt32LE(data.length, 24);
        dir.writeUInt16LE(nameBuf.length, 28);
        dir.writeUInt32LE(offset, 42);
        central.push(dir, nameBuf);
        offset += head.length + nameBuf.length + deflated.length;
    }
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    fs.writeFileSync(outFile, Buffer.concat([...local, centralBuf, end]));
}

function build(target, manifest) {
    const dir = path.join(DIST, target);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const entries = [];
    for (const file of manifestFiles(manifest)) {
        const data = file === 'manifest.json'
            ? Buffer.from(JSON.stringify(manifest, null, 4) + '\n', 'utf8')
            : fs.readFileSync(path.join(ROOT, file));
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), data);
        entries.push({ name: file, data });
    }
    const zip = path.join(DIST, 'Steam-Workshop-Filter-Plus-' + manifest.version + '-' + target + '.zip');
    writeZip(zip, entries);
    console.log(target + ': ' + entries.length + ' files -> ' + path.relative(ROOT, zip));
}

const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
for (const file of manifestFiles(source)) {
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error('manifest.json references a missing file: ' + file);
}

build('chrome', source);
const firefox = JSON.parse(JSON.stringify(source));
firefox.browser_specific_settings = { gecko: GECKO, gecko_android: { strict_min_version: '142.0' } };
build('firefox', firefox);
