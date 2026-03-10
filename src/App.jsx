import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Search, Copy, Check, Upload, Database, ChevronRight, FileSpreadsheet } from 'lucide-react';

const TABS = [
  { id: 'general', label: '일반정보', sheet: '일반정보' },
  { id: 'stand', label: '임분조사표', sheet: '임분조사표' },
  { id: 'tree', label: '임목조사표', sheet: '임목조사표' },
  { id: 'sapling', label: '치수조사표', sheet: '치수조사표' },
  { id: 'vegetation', label: '산림식생조사표', sheet: '산림식생조사표' },
  { id: 'herb', label: '초본종', sheet: '초본종' },
  { id: 'soil', label: '토양조사표', sheet: '토양특성조사표' },
];

function App() {
  const [db, setDb] = useState(null);
  const [fileName, setFileName] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [activePointId, setActivePointId] = useState(1);
  const [searchResult, setSearchResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // 토스트 메시지 표시
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  // 클립보드 복사
  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      showToast('복사되었습니다!');
    } catch (err) {
      showToast('복사 실패');
    }
  };

  // IndexedDB 핵심 로직
  const DB_NAME = 'ForestryDB';
  const STORE_NAME = 'ExcelStore';

  const saveToIDB = (fileName, buffer) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ fileName, buffer }, 'lastFile');
    };
  };

  const loadDefaultFile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/data.xlsx');
      if (!response.ok) throw new Error('Default file not found');
      const arrayBuffer = await response.arrayBuffer();
      processBuffer(arrayBuffer, '국가산림자원조사 데이터', true);
    } catch (err) {
      console.log('기본 데이터 파일을 찾을 수 없거나 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromIDB = useCallback(() => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
        e.target.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('lastFile');

      getReq.onsuccess = () => {
        if (getReq.result) {
          processBuffer(getReq.result.buffer, getReq.result.fileName, true);
        } else {
          // IDB에 데이터가 없으면 기본 파일 로드
          loadDefaultFile();
        }
      };
      getReq.onerror = () => loadDefaultFile();
    };
    request.onerror = () => loadDefaultFile();
  }, [loadDefaultFile]);

  useEffect(() => {
    loadFromIDB();
  }, [loadFromIDB]);

  // 공통 데이터 처리 로직
  const processBuffer = (arrayBuffer, name, isAutoLoad = false) => {
    setLoading(true);
    setFileName(name);

    // 약간의 딜레이를 주어 로딩 화면을 보여줌
    setTimeout(() => {
      try {
        const data = new Uint8Array(arrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        const newDb = {};
        wb.SheetNames.forEach(sheetName => {
          const worksheet = wb.Sheets[sheetName];
          const rawJson = XLSX.utils.sheet_to_json(worksheet);
          const normalizedJson = rawJson.map(row => {
            const newRow = {};
            Object.keys(row).forEach(k => {
              let cleanKey = k.replace(/[\s\r\n,]/g, '');
              if (cleanKey === '표점번호') cleanKey = '표본점번호';
              newRow[cleanKey] = row[k];
            });
            return newRow;
          });
          newDb[sheetName] = normalizedJson;
        });

        setDb(newDb);
        if (!isAutoLoad) {
          saveToIDB(name, arrayBuffer);
          showToast('데이터베이스 저장 및 로드 성공!');
        } else {
          showToast('데이터를 성공적으로 불러왔습니다!');
        }
      } catch (err) {
        console.error(err);
        showToast('파일 처리 오류');
        setFileName('');
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  // 엑셀 파일 로드 (수동 업로드)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => processBuffer(evt.target.result, file.name);
    reader.readAsArrayBuffer(file);
  };

  // 데이터 검색 및 가공
  const handleSearch = () => {
    if (!db) {
      showToast('먼저 엑셀 파일을 업로드해주세요.');
      return;
    }
    const cleanId = clusterId.trim();
    if (cleanId.length < 4) {
      showToast('집락번호를 정확히 입력해주세요.');
      return;
    }

    const result = {
      points: [1, 2, 3, 4].map(pointId => {
        const pointData = {};

        TABS.forEach(tab => {
          const sheetData = db[tab.sheet] || [];

          let rows = sheetData.filter(row => {
            const rowClusterId = String(row['집락번호'] || '').trim();
            const rowPointId = String(row['표본점번호'] || '').trim();

            const isClusterMatch = rowClusterId === cleanId;

            // 토양조사표 등 일부 시트는 표본점번호가 '1.0' 처럼 소수점으로 저장될 수 있음
            const cleanRowPointId = rowPointId.split('.')[0];
            const cleanPointId = String(pointId).split('.')[0];

            const isPointMatch =
              cleanRowPointId === cleanPointId ||
              rowPointId === (cleanId + pointId) ||
              (rowPointId.endsWith(cleanPointId) && rowPointId.includes(cleanId));

            return isClusterMatch && isPointMatch;
          });

          if (tab.id === 'tree') {
            const heights = rows.map(r => Number(r['수고'])).filter(h => !isNaN(h) && h > 0);
            const count = rows.length;
            const avgHeight = heights.length > 0 ? (heights.reduce((a, b) => a + b, 0) / heights.length).toFixed(2) : 0;

            let maxHeightInfo = '0[0]';
            if (heights.length > 0) {
              const maxH = Math.max(...heights);
              const maxSpecies = rows
                .filter(r => Number(r['수고']) === maxH)
                .map(r => r['수종명'] || r['식물명'] || '알수없음');
              const uniqueMaxSpecies = [...new Set(maxSpecies)];
              maxHeightInfo = `${uniqueMaxSpecies.join(', ')}[${maxH}]`;
            }

            const speciesList = [...new Set(rows.map(r => r['수종명'] || r['식물명'] || '알수없음'))].filter(s => s && s !== '알수없음');
            const summaryItems = [
              { label: '출현종', value: speciesList.join(', ') || '-' },
              { label: '본수', value: count },
              { label: '최대수고', value: maxHeightInfo },
              { label: '평균수고', value: avgHeight }
            ];

            // 비고(개체목구분코드)가 있는 개체목 상세 정보 추출 및 정렬
            const detailedTrees = [];
            rows.forEach((r) => {
              const code = String(r['비고(개체목구분코드)'] || '').trim();
              if (code !== '') {
                const name = r['수종명'] || r['식물명'] || '알수없음';
                const dbh = r['흉고직경'] || r['휼고직경'] || '-';
                const dist = r['거리(m)'] || r['거리'] || '-';
                const azi = r['방위각(º)'] || r['방위각'] || '-';

                detailedTrees.push({
                  code,
                  label: `개체목(${code})`,
                  value: `${name} | 흉고:${dbh} | 거리:${dist}m | 방위:${azi}º`
                });
              }
            });

            // 사용자 지정 순서: TS, S, T, LS, TLS
            const sortOrder = ['TS', 'S', 'T', 'LS', 'TLS'];
            detailedTrees.sort((a, b) => {
              const idxA = sortOrder.indexOf(a.code);
              const idxB = sortOrder.indexOf(b.code);
              const orderA = idxA === -1 ? 999 : idxA;
              const orderB = idxB === -1 ? 999 : idxB;
              return orderA - orderB;
            });

            // 결과 합치기 (중간에 구분자 역할을 할 가상 항목 추가)
            if (detailedTrees.length > 0) {
              pointData[tab.id] = [
                ...summaryItems,
                { label: '─────', value: '개체목 상세 리스트', isSeparator: true },
                ...detailedTrees.map(({ label, value }) => ({ label, value }))
              ];
            } else {
              pointData[tab.id] = summaryItems;
            }
          }
          else if (tab.id === 'soil') {
            // 토양조사표 데이터 가공
            const soilItems = [];
            rows.forEach((r, idx) => {
              // 핵심 키워드 기반 초정밀 매칭 함수
              const getFlexVal = (keywords, exclude = null) => {
                const normalize = (s) => String(s || '').replace(/[^가-힣A-Za-z0-9]/g, '');
                const normKeywords = keywords.map(k => normalize(k));
                const normExclude = exclude ? normalize(exclude) : null;

                let matches = [];

                for (const key in r) {
                  const kn = normalize(key);

                  // 제외 키워드 체크
                  if (normExclude && kn.includes(normExclude)) continue;

                  // 모든 키워드가 포함되어 있는지 확인
                  if (normKeywords.every(kw => kn.includes(kw))) {
                    matches.push({ key, val: r[key], len: kn.length });
                  }
                }

                if (matches.length > 0) {
                  // 가장 짧은 키(핵심적 명칭)를 우선 선택
                  matches.sort((a, b) => a.len - b.len);
                  return matches[0].val;
                }
                return undefined;
              };

              const formatVal = (val) => {
                let disp = '-';
                if (val !== undefined && val !== null) {
                  const s = String(val).trim();
                  if (s !== '') disp = s;
                }
                if (disp.startsWith('.')) disp = '0' + disp;
                return disp;
              };

              // 조사구 위치값 가져오기
              const loc = getFlexVal(['조사구위치']) || String(r['조사구위치'] || r['조사구 위치'] || `위치 ${idx + 1}`);
              soilItems.push({ label: '─────', value: `${loc} 정보`, isSeparator: true });

              // 낙엽/분해부식 통합 항목 (그룹화 형식)
              const leafVal = formatVal(getFlexVal(['낙엽', '두께']));
              const decompVal = formatVal(getFlexVal(['부식', '두께']));
              soilItems.push({
                label: '낙엽/분해부식',
                isGrouped: true,
                subItems: [
                  { label: '낙엽층 두께(cm)', value: leafVal },
                  { label: '분해/부식층 두께(cm)', value: decompVal }
                ]
              });

              // 토심 통합 항목 (그룹화 형식)
              const depthA = formatVal(getFlexVal(['A층'], '견'));
              const depthB = formatVal(getFlexVal(['B층'], '견'));
              const effectiveDepth = formatVal(getFlexVal(['유효', '토심']));
              soilItems.push({
                label: '토심',
                isGrouped: true,
                subItems: [
                  { label: 'A층(cm)', value: depthA },
                  { label: 'B층(cm)', value: depthB },
                  { label: '유효토심', value: effectiveDepth }
                ]
              });

              // 견밀도 통합 항목 (그룹화 형식)
              const densityA = formatVal(getFlexVal(['A층', '밀도']));
              const densityB = formatVal(getFlexVal(['B층', '밀도']));
              soilItems.push({
                label: '견밀도',
                isGrouped: true,
                subItems: [
                  { label: 'A층(mm)', value: densityA },
                  { label: 'B층(mm)', value: densityB }
                ]
              });

              // 견습도 통합 항목 (그룹화 형식)
              const humidityA = formatVal(getFlexVal(['A층', '습도']));
              const humidityB = formatVal(getFlexVal(['B층', '습도']));
              soilItems.push({
                label: '견습도',
                isGrouped: true,
                subItems: [
                  { label: 'A층(%)', value: humidityA },
                  { label: 'B층(%)', value: humidityB }
                ]
              });

              const normalizeSample = (v) => {
                const s = String(v || '').trim();
                if (['1', '채취', '예', '1.0'].includes(s)) return '채취';
                if (['0', '미채취', '아니오', '0.0', ''].includes(s)) return '미채취';
                return '-';
              };

              // 낙엽/분식 시료채취 통합 항목
              const leafSample = normalizeSample(getFlexVal(['낙엽', '시료']));
              const decompSample = normalizeSample(getFlexVal(['부식', '시료']));
              soilItems.push({
                label: '낙엽/분식 시료채취',
                isGrouped: true,
                subItems: [
                  { label: '낙엽층', value: leafSample },
                  { label: '분해/부식층', value: decompSample }
                ]
              });

              // A/B층 시료채취 통합 항목
              const aSample = normalizeSample(getFlexVal(['A층', '시료']));
              const bSample = normalizeSample(getFlexVal(['B층', '시료']));
              soilItems.push({
                label: 'A/B층 시료채취',
                isGrouped: true,
                subItems: [
                  { label: 'A층', value: aSample },
                  { label: 'B층', value: bSample }
                ]
              });

              // 심도별 정보 통합 항목
              const depth010 = formatVal(getFlexVal(['010']));
              const depth1020 = formatVal(getFlexVal(['1020']));
              const depth2030 = formatVal(getFlexVal(['2030']));
              soilItems.push({
                label: '심도별 정보',
                isGrouped: true,
                subItems: [
                  { label: '0~10cm', value: depth010 },
                  { label: '10~20cm', value: depth1020 },
                  { label: '20~30cm', value: depth2030 }
                ]
              });

              const fields = [
                { label: '비고', keywords: ['비고'] }
              ];

              fields.forEach(f => {
                let val = getFlexVal(f.keywords, f.exclude);
                soilItems.push({ label: f.label, value: formatVal(val) });
              });
            });
            pointData[tab.id] = soilItems;
          }
          else if (['vegetation', 'herb', 'sapling'].includes(tab.id)) {
            // 산림식생조사표, 초본종, 치수조사표는 조사구별(1: 0도, 2: 120도, 3: 240도)로 그룹화하여 표시
            const plotMapping = { '1': '0도', '2': '120도', '3': '240도' };
            const groupedByPlot = {};

            rows.forEach(r => {
              const plotName = String(r['조사구명'] || '').trim();
              if (!groupedByPlot[plotName]) groupedByPlot[plotName] = [];
              groupedByPlot[plotName].push(r);
            });

            const items = [];
            const sortedPlots = Object.keys(groupedByPlot).sort((a, b) => {
              const numA = parseInt(a);
              const numB = parseInt(b);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.localeCompare(b);
            });

            if (tab.id === 'herb') {
              // 초본종은 수종명 데이터를 조사구별로 한 줄로 모아서 가독성 있게 표시
              sortedPlots.forEach(plot => {
                const speciesList = [...new Set(groupedByPlot[plot].map(r => r['수종명'] || r['식물명'] || '알수없음'))].filter(s => s && s !== '알수없음');
                if (speciesList.length === 0) return;
                const angleText = plotMapping[plot] ? ` (${plotMapping[plot]})` : '';
                items.push({
                  label: plot === '' ? '수종명' : `조사구 ${plot}${angleText}`,
                  value: speciesList.join(', ') || '-'
                });
              });
            } else {
              // 산림식생조사표 및 치수조사표는 상세 정보를 개별 행으로 표시
              sortedPlots.forEach(plot => {
                const angleText = plotMapping[plot] ? ` (${plotMapping[plot]})` : '';
                if (plot !== '') {
                  items.push({ label: '─────', value: `조사구 ${plot}${angleText}`, isSeparator: true });
                }

                // 치수조사표일 경우 해당 조사구의 수종 요약(출현종)을 상단에 추가
                if (tab.id === 'sapling') {
                  const speciesList = [...new Set(groupedByPlot[plot].map(r => r['수종명'] || r['식물명'] || '알수없음'))].filter(s => s && s !== '알수없음');
                  if (speciesList.length > 0) {
                    items.push({
                      label: '출현종',
                      value: speciesList.join(', ') || '-'
                    });
                  }
                }

                groupedByPlot[plot].forEach(r => {
                  const name = r['수종명'] || r['식물명'] || '알수없음';
                  let detail = '';

                  if (tab.id === 'sapling') {
                    const dia = r['근원경'] || '-';
                    const count = r['본수'] || '-';
                    detail = `근원경: ${dia} | 본수: ${count}`;
                  } else {
                    const count = r['출현수'] !== undefined ? `출현수: ${r['출현수']}` : '';
                    const dominance = r['우점도'] !== undefined ? r['우점도'] : r['우점도코드'];
                    const dominanceText = dominance !== undefined ? `우점도: ${dominance}` : '';
                    detail = [count, dominanceText].filter(Boolean).join(' | ');
                  }

                  items.push({ label: name, value: detail || '-' });
                });
              });
            }
            pointData[tab.id] = items;
          }
          else {
            if (rows.length > 0) {
              const firstRow = rows[0];
              const commonExcludes = ['집락번호', '표본점번호', '조사차기', '토지이용코드', '임상코드', '시도코드', '시군구코드', '읍면동코드', 'GPS수신상태'];
              const standExcludes = [
                '조사일자', '도엽번호', '지형코드', '사면위치코드', '8방위코드', '8방위코드명',
                '수관밀도코드', '경급코드', '영급코드', '소유코드', '소유', '임종코드', '지종', '지종코드',
                '갱신코드', '토양형코드', '토성(A)코드', '토성(B)코드', '암석노출도코드',
                '침식상태코드', '지형지물종류', '지형지물거리', '지형지물방위', '입력자',
                '지형(산림식생)코드', '지형(산림식생)', '갱신형태코드', '토양형', '토성(A)', '토성(B)', '조사연도'
              ];
              const excludeFields = tab.id === 'stand' ? [...commonExcludes, ...standExcludes] : commonExcludes;

              const baseItems = Object.entries(firstRow)
                .filter(([key]) => !excludeFields.includes(key))
                .map(([key, val]) => {
                  let displayValue = val;
                  // 특정 필드에 대해 값 변환
                  if (key === '산림여부') {
                    if (String(val) === '1') displayValue = '산림';
                    else if (String(val) === '0') displayValue = '비산림';
                  } else if (['조사가능여부', '시료채취여부'].includes(key)) {
                    if (String(val) === '1') displayValue = '예';
                    else if (String(val) === '0') displayValue = '아니오';
                  } else if (key === '조사일자' && String(val).length === 8) {
                    const s = String(val);
                    displayValue = `${s.substring(0, 4)}년 ${s.substring(4, 6)}월 ${s.substring(6, 8)}일`;
                  } else if (key === '표본점관리현황(모니터링가능여부)') {
                    const pointType = String(firstRow['표본점종류'] || '').trim();
                    if (pointType === '재조사') {
                      displayValue = '가능';
                    } else if (pointType === '신규') {
                      displayValue = '-';
                    } else {
                      if (val === undefined || val === null || String(val).trim() === '') {
                        displayValue = '-';
                      }
                    }
                  }
                  return { label: key, value: displayValue };
                });

              // 엑셀 셀 자체가 비어있어 항목이 아예 누락된 경우 강제로 적절한 값으로 밀어넣기
              if (tab.id === 'general') {
                const monitorKey = '표본점관리현황(모니터링가능여부)';
                if (!baseItems.find(i => i.label === monitorKey)) {
                  const pointType = String(firstRow['표본점종류'] || '').trim();
                  baseItems.push({ label: monitorKey, value: pointType === '재조사' ? '가능' : '-' });
                }
              }

              // 임분조사표에서 지역 정보 가져와 일반정보에 삽입
              if (tab.id === 'general') {
                // '임상' 항목 추출 및 일반정보에서 제거
                const imsangIndex = baseItems.findIndex(i => i.label === '임상');
                if (imsangIndex !== -1) {
                  const imsangItem = baseItems.splice(imsangIndex, 1)[0];
                  pointData._imsang = imsangItem; // 임시 저장
                }

                const standRows = (db['임분조사표'] || []).filter(row => {
                  const rId = String(row['집락번호'] || '').trim();
                  const pId = String(row['표본점번호'] || '').trim();
                  return rId === cleanId && (pId === String(pointId) || pId === (cleanId + pointId) || pId.endsWith(String(pointId)));
                });

                if (standRows.length > 0) {
                  const standRow = standRows[0];
                  const address = [
                    standRow['광역시도'],
                    standRow['시군구'],
                    standRow['읍면동']
                  ].filter(Boolean).join(' ');

                  const regionInfo = address ? [{ label: '주소', value: address }] : [];
                  const coordInfo = [
                    { label: '좌표N', value: standRow['좌표N'] },
                    { label: '좌표E', value: standRow['좌표E'] }
                  ].filter(i => i.value !== undefined);

                  // 1. 기존 '조사일자' 항목을 찾아 제거 (순서 재배치를 위해)
                  const dateIndex = baseItems.findIndex(i => i.label === '조사일자');
                  let dateItem = null;
                  if (dateIndex !== -1) {
                    dateItem = baseItems.splice(dateIndex, 1)[0];
                  }

                  // 2. 주소와 좌표 정보 준비
                  const addressAndCoords = [...regionInfo, ...coordInfo];

                  // 3. 조사일자가 있다면 가장 앞에 두고 그 뒤에 주소/좌표 삽입
                  if (dateItem) {
                    baseItems.unshift(dateItem, ...addressAndCoords);
                  } else {
                    baseItems.unshift(...addressAndCoords);
                  }
                }
                pointData[tab.id] = baseItems;
              } else if (tab.id === 'stand') {
                // 일반정보에서 가져온 '임상'을 '지형' 위에 배치
                if (pointData._imsang) {
                  // 중복 방지를 위해 기존 '임상'이 있으면 제거
                  const existingImsangIndex = baseItems.findIndex(i => i.label === '임상');
                  if (existingImsangIndex !== -1) {
                    baseItems.splice(existingImsangIndex, 1);
                  }

                  const jihyungIndex = baseItems.findIndex(i => i.label === '지형');
                  if (jihyungIndex !== -1) {
                    baseItems.splice(jihyungIndex, 0, pointData._imsang);
                  } else {
                    baseItems.unshift(pointData._imsang);
                  }
                }
                // 임분조사표에서는 코드류와 이미 옮겨진 지역명, 좌표 필터링
                const finalStandItems = baseItems.filter(i => !['광역시도', '시군구', '읍면동', '좌표N', '좌표E'].includes(i.label));

                // 비산림면적 데이터 가져와서 삽입
                const nonForestSheet = db['비산림면적'] || [];
                const nonForestRow = nonForestSheet.find(row => {
                  const rId = String(row['집락번호'] || '').trim();
                  const pId = String(row['표본점번호'] || '').trim();

                  // 집락번호는 정확히 일치해야 함
                  if (rId !== cleanId) return false;

                  // 표본점번호 매칭 (예: 1121082 vs 2)
                  // 단순히 endsWith만 쓰면 12가 2에 매칭될 수 있으므로 조심
                  const sPointId = String(pointId);
                  return (
                    pId === sPointId ||
                    pId === (cleanId + sPointId) ||
                    pId === (cleanId + '0' + sPointId) ||
                    (pId.endsWith(sPointId) && pId.length > cleanId.length)
                  );
                });

                if (nonForestRow) {
                  // 엑셀 파싱 시 모든 공백이 제거되었으므로 공백 없는 키로 접근합니다.
                  const basicVal = nonForestRow['기본조사원비산림면적'];
                  const largeVal = nonForestRow['대경목조사원비산림면적'];

                  const nonForestInfo = [
                    { label: '기본조사원 비산림면적', value: (basicVal !== undefined && basicVal !== null) ? String(basicVal) : '0' },
                    { label: '대경목조사원 비산림면적', value: (largeVal !== undefined && largeVal !== null) ? String(largeVal) : '0' }
                  ];

                  // 표본점현지정보 바로 밑에 삽입 시도
                  const targetIndex = finalStandItems.findIndex(i => i.label === '표본점현지정보' || i.label.includes('현지정보'));
                  if (targetIndex !== -1) {
                    finalStandItems.splice(targetIndex + 1, 0, ...nonForestInfo);
                  } else {
                    finalStandItems.push(...nonForestInfo);
                  }
                }

                pointData[tab.id] = finalStandItems;
              } else {
                pointData[tab.id] = baseItems;
              }
            } else {
              pointData[tab.id] = [];
            }
          }
        });

        return { pointId, data: pointData };
      })
    };

    setSearchResult(result);
  };

  const handleClear = () => {
    setClusterId('');
    setSearchResult(null);
    setActivePointId(1);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>국가산림자원조사 전차기 데이터</h1>
        <div className="search-container">
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              inputMode="tel"
              className="search-input"
              placeholder="집락번호 6자리를 입력하세요"
              style={{ width: '100%' }}
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            {clusterId && (
              <button
                onClick={handleClear}
                style={{
                  position: 'absolute', right: '10px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-secondary)',
                  fontSize: '1.2rem', padding: '5px'
                }}
              >
                ×
              </button>
            )}
          </div>
          <button className="search-button" onClick={handleSearch}>
            <Search size={20} />
          </button>
        </div>
        {db && (
          <div style={{
            fontSize: '0.75rem', color: 'var(--text-secondary)',
            marginTop: '0.5rem', textAlign: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
          }}>
            <FileSpreadsheet size={12} /> {fileName} (로드됨)
            <button
              onClick={() => { setDb(null); setFileName(''); setSearchResult(null); }}
              style={{ color: '#ff5252', marginLeft: '10px', textDecoration: 'underline' }}
            >
              파일 변경
            </button>
          </div>
        )}
      </header>

      {!db ? (
        <div className="empty-state">
          <label className="upload-zone">
            <Upload size={48} className="empty-state-icon" />
            <p>데이터베이스 엑셀 파일을 업로드하세요</p>
            <input type="file" className="file-input" accept=".xlsx, .xls" onChange={handleFileUpload} />
          </label>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            대상 파일: mdb_nfi_2021.xlsx
          </p>
        </div>
      ) : (
        <>
          {/* Tabs Navigation (Category) */}
          <nav className="tabs-container">
            <div className="tabs-list">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Point Selection Tabs */}
          <nav className="points-tabs-container">
            <div className="points-tabs-list">
              {[1, 2, 3, 4].map(id => (
                <button
                  key={id}
                  className={`point-tab-item ${activePointId === id ? 'active' : ''}`}
                  onClick={() => setActivePointId(id)}
                >
                  표본점 {id}
                </button>
              ))}
            </div>
          </nav>

          {/* Content Area */}
          <main className="content-area">
            {!searchResult ? (
              <div className="empty-state">
                <Database size={48} className="empty-state-icon" />
                <p>조회할 집락번호를 입력하고 검색 아이콘을 누르세요</p>
              </div>
            ) : (
              searchResult.points
                .filter(p => p.pointId === activePointId)
                .map(point => (
                  <section key={point.pointId} className="sample-point-section">
                    <h2 className="section-header">표본점 {point.pointId}</h2>
                    <div className="data-card">
                      {point.data[activeTab]?.length > 0 ? (
                        (() => {
                          const allRows = point.data[activeTab];

                          // 핵심 정보 그룹
                          const coreKeys = ['조사연도', '산림여부', '조사가능여부'];
                          const coreItems = allRows.filter(item => coreKeys.includes(item.label));

                          // 조사자 그룹
                          const surveyorKeys = ['조사자1', '조사자2', '조사자3', '조사자4'];
                          const surveyorItems = allRows.filter(item => surveyorKeys.includes(item.label));

                          // 수관밀도 그룹
                          const canopyMap = {
                            '중심수관밀도': '중심',
                            '0도수관밀도': '0도',
                            '120도수관밀도': '120도',
                            '240도수관밀도': '240도',
                            '수관밀도평균': '평균'
                          };
                          const canopyKeys = Object.keys(canopyMap);
                          const canopyItems = allRows
                            .filter(item => canopyKeys.includes(item.label))
                            .map(item => ({ label: canopyMap[item.label], value: item.value }));

                          // 임분 현황 그룹 (경급, 영급, 임종, 갱신형태)
                          const standKeys = ['경급', '영급', '임종', '갱신형태'];
                          const standItems = allRows.filter(item => standKeys.includes(item.label));

                          // 토양상태 그룹 (암석노출도, 침식상태)
                          const soilKeys = ['암석노출도', '침식상태'];
                          const soilItems = allRows.filter(item => soilKeys.includes(item.label));

                          // 위치정보 그룹 (도로로부터의거리, 해발고)
                          const locKeys = ['도로로부터의거리', '해발고'];
                          const locItems = allRows.filter(item => locKeys.includes(item.label));

                          // 지형정보 그룹 (경사, 방위)
                          const topoKeys = ['경사', '방위'];
                          const topoItems = allRows.filter(item => topoKeys.includes(item.label));

                          // 지황정보 그룹 (지형, 사면위치)
                          const jiHwangKeys = ['지형', '사면위치'];
                          const jiHwangItems = allRows.filter(item => jiHwangKeys.includes(item.label));

                          // 산림정보 그룹 (임상, 수관밀도)
                          const forestKeys = ['임상', '수관밀도'];
                          const forestItems = allRows.filter(item => forestKeys.includes(item.label));

                          // 산림교란 그룹 (산불, 병해충)
                          const distKeys = ['산림교란(산불)', '산림교란(병해충)'];
                          const distItems = allRows.filter(item => distKeys.includes(item.label));

                          // 산림교란(기타) 그룹 (기상, 인위적)
                          const dist2Keys = ['산림교란(기상)', '산림교란(인위적)'];
                          const dist2Items = allRows.filter(item => dist2Keys.includes(item.label));

                          // 산림교란(기타2) 그룹 (덩굴, 기타)
                          const dist3Keys = ['산림교란(덩굴)', '산림교란(기타)'];
                          const dist3Items = allRows.filter(item => dist3Keys.includes(item.label));

                          // 비산림면적 그룹 (기본, 대경목)
                          const nonForestKeys = ['기본조사원 비산림면적', '대경목조사원 비산림면적'];
                          const nonForestItems = allRows.filter(item => nonForestKeys.includes(item.label));

                          // 좌표 그룹 (좌표N, 좌표E)
                          const coordKeys = ['좌표N', '좌표E'];
                          const coordItems = allRows.filter(item => coordKeys.includes(item.label));

                          // 토지이용/표본점정보 그룹 (토지이용, 표본점종류)
                          const landTypeKeys = ['토지이용', '표본점종류'];
                          const landTypeItems = allRows.filter(item => landTypeKeys.includes(item.label));

                          // 시업 정보 그룹 (시업년도, 시업내용)
                          const workKeys = ['시업년도', '시업내용'];
                          const workItems = allRows.filter(item => workKeys.includes(item.label));

                          const otherItems = allRows.filter(item =>
                            !coreKeys.includes(item.label) &&
                            !surveyorKeys.includes(item.label) &&
                            !canopyKeys.includes(item.label) &&
                            !standKeys.includes(item.label) &&
                            !soilKeys.includes(item.label) &&
                            !locKeys.includes(item.label) &&
                            !jiHwangKeys.includes(item.label) &&
                            !forestKeys.includes(item.label) &&
                            !distKeys.includes(item.label) &&
                            !dist2Keys.includes(item.label) &&
                            !dist3Keys.includes(item.label) &&
                            !nonForestKeys.includes(item.label) &&
                            !coordKeys.includes(item.label) &&
                            !landTypeKeys.includes(item.label) &&
                            !workKeys.includes(item.label)
                          ).filter(item => {
                            // 표본점 1에만 특정 정보 표시 (2,3,4는 생략하여 중복 제거)
                            const sharedKeys = ['표본점이동경로', '주소', '조사일자'];
                            if (point.pointId !== 1 && sharedKeys.includes(item.label)) return false;
                            return true;
                          });

                          return (
                            <>
                              {/* 핵심 정보 그룹 */}
                              {coreItems.length > 0 && (
                                <div className="data-row grouped-row">
                                  {coreItems.map((item, gIdx) => (
                                    <div key={gIdx} className="group-item" onClick={() => copyToClipboard(item.value)}>
                                      <span className="group-label">{item.label}</span>
                                      <span className="group-value">{item.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* 조사자 그룹 (표본점 1에만 표시) */}
                              {point.pointId === 1 && surveyorItems.length > 0 && (
                                <div className="data-row grouped-row" style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                                  {surveyorItems.map((item, gIdx) => (
                                    <div key={gIdx} className="group-item" onClick={() => copyToClipboard(item.value)}>
                                      <span className="group-label">{item.label}</span>
                                      <span className="group-value" style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                                        {item.value || '-'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* 나머지 정보 (기존 방식) */}
                              {otherItems.map((row, idx) => (
                                <React.Fragment key={idx}>
                                  {/* 경사 바로 위에 위치/접근성, 지형정보 표시 */}
                                  {row.label === '경사' && (
                                    <>
                                      {locItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(156, 39, 176, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>위치/접근성</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {locItems.map((item, lIdx) => (
                                              <div key={lIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {topoItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(233, 30, 99, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>지형정보</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {topoItems.map((item, tIdx) => (
                                              <div key={tIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {jiHwangItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(0, 150, 136, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>지황정보</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {jiHwangItems.map((item, jIdx) => (
                                              <div key={jIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {soilItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(255, 152, 0, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>토양상태</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {soilItems.map((item, soilIdx) => (
                                              <div key={soilIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {standItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(33, 150, 243, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>임분현황</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto', gap: '0.5rem' }}>
                                            {standItems.map((item, sIdx) => (
                                              <div key={sIdx} className="group-item" style={{ minWidth: 'max-content', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500', whiteSpace: 'nowrap' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {forestItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(139, 195, 74, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>산림정보</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {forestItems.map((item, fIdx) => (
                                              <div key={fIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {canopyItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(76, 175, 80, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>수관밀도현황</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {canopyItems.map((item, cIdx) => (
                                              <div key={cIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem' }}>{item.value}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}


                                    </>
                                  )}

                                  {!topoKeys.includes(row.label) && !jiHwangKeys.includes(row.label) && !forestKeys.includes(row.label) && !distKeys.includes(row.label) && !dist2Keys.includes(row.label) && !dist3Keys.includes(row.label) && !nonForestKeys.includes(row.label) && !coordKeys.includes(row.label) && !landTypeKeys.includes(row.label) && !workKeys.includes(row.label) && (
                                    row.isSeparator ? (
                                      <div className="data-row separator-row">
                                        <span className="separator-text">{row.value}</span>
                                      </div>
                                    ) : row.isGrouped ? (
                                      <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(76, 175, 80, 0.03)', borderTop: 'none', paddingBottom: '12px' }}>
                                        <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '8px', display: 'block' }}>{row.label}</span>
                                        <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap' }}>
                                          {row.subItems.map((item, siIdx) => (
                                            <div key={siIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                              <span className="group-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{item.label}</span>
                                              <span className="group-value" style={{ fontSize: '1rem', fontWeight: '600', color: '#4caf50', marginTop: '4px' }}>{item.value || '-'}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className={`data-row ${['주소', '임분현황', '표본점이동경로', '비고', '특이사항', '표본점현지정보', '야생동물서식흔적', '출현종'].includes(row.label) || row.label.includes('출현종') || ['herb', 'sapling'].includes(activeTab) ? 'multiline-row' : ''}`}>
                                        <span
                                          className="label"
                                          style={['vegetation', 'sapling'].includes(activeTab) ? { fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '500' } : {}}
                                        >
                                          {row.label}
                                        </span>
                                        <span
                                          className="value"
                                          style={['vegetation', 'sapling'].includes(activeTab) ? { fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'normal' } : {}}
                                        >
                                          {row.value}
                                        </span>
                                        <button
                                          className="copy-btn"
                                          onClick={() => copyToClipboard(row.value)}
                                          title="복사"
                                        >
                                          <Copy size={16} />
                                        </button>
                                      </div>
                                    )
                                  )}

                                  {/* 주소 바로 밑에 좌표 표시 */}
                                  {row.label === '주소' && coordItems.length > 0 && (
                                    <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(156, 39, 176, 0.03)', borderTop: 'none' }}>
                                      <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>좌표</span>
                                      <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                        {coordItems.map((item, cIdx) => (
                                          <div key={cIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                            <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                            <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 좌표 바로 밑에 토지이용/표본점종류 표시 */}
                                  {row.label === '주소' && landTypeItems.length > 0 && (
                                    <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(76, 175, 80, 0.03)', borderTop: 'none' }}>
                                      <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>토지이용/표본점정보</span>
                                      <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                        {landTypeItems.map((item, ltIdx) => (
                                          <div key={ltIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                            <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                            <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 토지이용/표본점정보 바로 밑에 시업정보 표시 */}
                                  {row.label === '주소' && workItems.length > 0 && (
                                    <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(63, 81, 181, 0.03)', borderTop: 'none' }}>
                                      <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>시업정보</span>
                                      <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                        {workItems.map((item, wIdx) => (
                                          <div key={wIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                            <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                            <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 표본점현지정보 바로 밑에 비산림면적 표시 */}
                                  {row.label === '표본점현지정보' && nonForestItems.length > 0 && (
                                    <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(0, 188, 212, 0.03)', borderTop: 'none' }}>
                                      <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>비산림면적</span>
                                      <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                        {nonForestItems.map((item, nIdx) => (
                                          <div key={nIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                            <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                            <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 특이사항 바로 밑에 산림교란 표시 */}
                                  {row.label === '특이사항' && (
                                    <>
                                      {distItems.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(255, 87, 34, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>산림교란</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {distItems.map((item, dIdx) => (
                                              <div key={dIdx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {dist2Items.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(255, 152, 0, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>산림교란(2)</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {dist2Items.map((item, d2Idx) => (
                                              <div key={d2Idx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {dist3Items.length > 0 && (
                                        <div className="data-row multiline-row" style={{ backgroundColor: 'rgba(255, 193, 7, 0.03)', borderTop: 'none' }}>
                                          <span className="label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>산림교란(3)</span>
                                          <div className="grouped-row" style={{ width: '100%', background: 'transparent', padding: 0, border: 'none', flexWrap: 'nowrap', overflowX: 'auto' }}>
                                            {dist3Items.map((item, d3Idx) => (
                                              <div key={d3Idx} className="group-item" style={{ minWidth: 'unset', flex: 1 }} onClick={() => copyToClipboard(item.value)}>
                                                <span className="group-label" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                                                <span className="group-value" style={{ fontSize: '0.9rem', fontWeight: '500' }}>{item.value || '-'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          );
                        })()
                      ) : (
                        <div className="data-row">
                          <span className="label" style={{ textAlign: 'center', width: '100%' }}>데이터가 없습니다</span>
                        </div>
                      )}
                    </div>
                  </section>
                ))
            )}
          </main>
        </>
      )}

      {/* Toast Notification */}
      {toast && <div className="toast">{toast}</div>}

      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 2000
        }}>
          <div className="toast" style={{ position: 'relative', bottom: 0 }}>데이터 처리 중...</div>
        </div>
      )}
    </div>
  );
}

export default App;
