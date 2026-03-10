import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');

async function run() {
    try {
        const workbook = readFile(filePath);
        const sheetName = '토양특성조사표';
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            console.log('Sheet not found');
            return;
        }

        const data = utils.sheet_to_json(sheet);
        const targetCluster = '124100';
        const rows = data.filter(r => String(r['집락번호']).trim() === targetCluster);

        console.log(`Found ${rows.length} rows for cluster ${targetCluster}`);
        if (rows.length > 0) {
            console.log('Row 0 keys and values:');
            Object.entries(rows[0]).forEach(([k, v]) => {
                console.log(`Key: [${k}], Value: [${v}]`);
            });
        }
    } catch (e) {
        console.error(e);
    }
}
run();
