const r = {
    '낙엽층 두께(cm)': '.7',
    '분해/부식층 두께(cm)': '.1',
    'A층(cm)': '9',
    'B층(cm)': '22',
    '유효토심': '17',
    'A층 견밀도(mm)': '13',
    '견밀도(mm)B층': '16',
    'A층 견습도(%)': '15(약건)',
    'B층 견습도(%)': '18(약건)',
    '0~10cm깊이': '10',
    '10~20cm깊이': '10',
    '20~30cm깊이': '0'
};

const getFlexVal = (targetLabel, excludeKeyword = null) => {
    const normalize = (s) => String(s || '').replace(/[^가-힣A-Za-z0-9]/g, '');
    const targetNorm = normalize(targetLabel);

    // 1. 완전 일치 우선
    for (const key in r) {
        const kn = normalize(key);
        if (kn === targetNorm) return r[key];
    }

    // 2. 포함 관계 검색
    for (const key in r) {
        const kn = normalize(key);
        if (kn.includes(targetNorm)) {
            if (excludeKeyword && kn.includes(normalize(excludeKeyword))) continue;
            return r[key];
        }
    }

    // 3. 특수 케이스 (B층견밀도 등)
    if (targetNorm === 'B층견밀도') {
        for (const key in r) {
            const kn = normalize(key);
            if (kn.includes('B층') && kn.includes('견밀도')) return r[key];
        }
    }
    return undefined;
};

const fields = [
    { label: '낙엽층두께(cm)', search: '낙엽층두께' },
    { label: '분해/부식층두께(cm)', search: '분해부식층두께' },
    { label: 'A층(cm)', search: 'A층', exclude: '견밀도' },
    { label: 'B층(cm)', search: 'B층', exclude: '견밀도' },
    { label: '유효토심', search: '유효토심' },
    { label: 'A층견밀도(mm)', search: 'A층견밀도' },
    { label: 'B층견밀도(mm)', search: 'B층견밀도' },
    { label: 'A층견습도(%)', search: 'A층견습도' },
    { label: 'B층견습도(%)', search: 'B층견습도' },
    { label: '0~10cm깊이', search: '010cm' },
    { label: '10~20cm깊이', search: '1020cm' },
    { label: '20~30cm깊이', search: '2030cm' }
];

fields.forEach(f => {
    console.log(`${f.label} -> `, getFlexVal(f.search, f.exclude));
});
