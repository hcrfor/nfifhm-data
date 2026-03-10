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
        const workbook = readFile(filePath);
        const sheetName = '토양특성조사표';
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;

        const data = utils.sheet_to_json(sheet);
        const targetCluster = '124100';
        const targetPoint = '1241001';
        const rows = data.filter(r => String(r['집락번호']).trim() === targetCluster && String(r['표본점번호']).trim() === targetPoint);

        let output = '';
        rows.forEach((row, i) => {
            output += `--- Row ${i} --- \n`;
            Object.entries(row).forEach(([k, v]) => {
                output += `Key: [${k}] (len: ${k.length}), Value: [${v}]\n`;
            });
        });

        fs.writeFileSync('cluster_124100_soil_dump.txt', output);
        console.log('Dumped to cluster_124100_soil_dump.txt');
    } catch (e) {
        console.error(e);
    }
}
run();
