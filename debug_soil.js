import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');
try {
    const workbook = readFile(filePath);
    const sheetName = '토양특성조사표';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        console.log('Sheet "토양특성조사표" not found!');
        console.log('Available sheets:', workbook.SheetNames);
    } else {
        const data = utils.sheet_to_json(sheet);
        console.log('Total rows in 토양특성조사표:', data.length);
        if (data.length > 0) {
            console.log('--- First Row Keys and values ---');
            Object.entries(data[0]).forEach(([k, v]) => {
                console.log(`Key: [${k}], Value: [${v}]`);
            });

            console.log('--- Sample data for first 5 rows (Cluster, Point, Loc) ---');
            data.slice(0, 5).forEach((row, i) => {
                console.log(`Row ${i}: 집락번호=[${row['집락번호']}], 표본점번호=[${row['표본점번호']}], 조사구위치=[${row['조사구위치']}]`);
            });
        }
    }
} catch (e) {
    console.error('Error:', e);
}
