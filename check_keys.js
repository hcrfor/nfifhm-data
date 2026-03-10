import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');

async function run() {
    try {
        console.log('Reading file...');
        const workbook = readFile(filePath, { sheetRows: 5 });
        const sheetName = '토양특성조사표';
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            console.log('Sheet not found. Available:', workbook.SheetNames);
            return;
        }

        const data = utils.sheet_to_json(sheet);
        if (data.length > 0) {
            console.log('Keys in "토양특성조사표":');
            console.log(JSON.stringify(Object.keys(data[0]), null, 2));
        } else {
            console.log('No rows found in sheet.');
        }
    } catch (e) {
        console.error(e);
    }
}

run();
