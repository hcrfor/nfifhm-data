import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');

async function run() {
    try {
        const workbook = readFile(filePath, { sheetRows: 20 });
        const sheetName = '토양특성조사표';
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) return;

        const rawJson = utils.sheet_to_json(sheet);
        const log = [];
        if (rawJson.length > 0) {
            log.push('Keys of first row:');
            log.push(JSON.stringify(Object.keys(rawJson[0]), null, 2));
            log.push('Values of first row:');
            log.push(JSON.stringify(rawJson[0], null, 2));
        }

        fs.writeFileSync('soil_debug_output.txt', log.join('\n'));
        console.log('Debug info written to soil_debug_output.txt');
    } catch (e) {
        console.error(e);
    }
}

run();
