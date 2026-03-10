import pkg from 'xlsx';
const { readFile, utils } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'mdb_nfi_2021.xlsx');
try {
    const workbook = readFile(filePath);
    const sheetName = '일반정보';
    const sheet = workbook.Sheets[sheetName];
    const data = utils.sheet_to_json(sheet);

    console.log('Total rows in 일반정보:', data.length);

    const searchId = '118400';
    const matches = data.filter(row => String(row['집락번호']).trim() === searchId);

    console.log(`Found ${matches.length} matches for ${searchId}`);
    if (matches.length > 0) {
        console.log('Example Match Keys and Values:');
        const firstMatch = matches[0];
        Object.entries(firstMatch).forEach(([k, v]) => {
            console.log(`Key: "${k}" (Length: ${k.length}), Value: ${v} (Type: ${typeof v})`);
        });
    } else {
        console.log('No matches found. Showing first 5 rows 집락번호 data:');
        data.slice(0, 5).forEach((row, i) => {
            console.log(`Row ${i} 집락번호: ${row['집락번호']} (Type: ${typeof row['집락번호']})`);
        });
    }
} catch (e) {
    console.error('Error:', e);
}
