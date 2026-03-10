import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');

async function run() {
    try {
        const workbook = readFile(filePath, { sheetRows: 10 });
        const sheetName = '토양특성조사표';
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) return;

        const data = utils.sheet_to_json(sheet, { header: 1 }); // Read as array of arrays
        console.log('First 10 rows of "토양특성조사표":');
        data.forEach((row, i) => {
            console.log(`Row ${i}:`, row);
        });
    } catch (e) {
        console.error(e);
    }
}

run();
