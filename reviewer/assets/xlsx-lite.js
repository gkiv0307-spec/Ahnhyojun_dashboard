/*!
 * xlsx-lite.js — 의존성 없는 최소 XLSX 읽기/쓰기 유틸
 * - 쓰기: ZIP(STORE, 무압축) + inlineStr 시트로 실제 .xlsx 생성
 * - 읽기: ZIP 파싱 + DecompressionStream('deflate-raw')로 해제 후 시트 파싱
 * 외부 CDN 없이 브라우저 표준 API만 사용한다.
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------- CRC32 / ZIP */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8');

  function dosDateTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  /** files: [{name, data:Uint8Array}] -> Blob(application/zip) */
  function zipWrite(files, mime) {
    var stamp = dosDateTime(new Date());
    var parts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);

      var lh = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // UTF-8 flag
      lv.setUint16(8, 0, true);           // method: store
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      parts.push(lh, data);

      var ch = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);

      offset += lh.length + data.length;
    });

    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: mime || 'application/zip' });
  }

  function inflateRaw(u8) {
    if (typeof global.DecompressionStream !== 'function') {
      return Promise.reject(new Error('이 브라우저는 압축 해제를 지원하지 않습니다. CSV 파일로 업로드해 주세요.'));
    }
    var ds = new global.DecompressionStream('deflate-raw');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  /** ArrayBuffer -> Promise<Map<name, Uint8Array>> */
  function zipRead(buffer) {
    var u8 = new Uint8Array(buffer);
    var dv = new DataView(buffer);
    var eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('올바른 엑셀(zip) 파일이 아닙니다.'));

    var count = dv.getUint16(eocd + 10, true);
    var cdOffset = dv.getUint32(eocd + 16, true);
    var entries = [];
    var p = cdOffset;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var cmtLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name: name, method: method, csize: csize, lho: lho });
      p += 46 + nameLen + extraLen + cmtLen;
    }

    var out = new Map();
    return entries.reduce(function (chain, e) {
      return chain.then(function () {
        var ln = dv.getUint16(e.lho + 26, true);
        var le = dv.getUint16(e.lho + 28, true);
        var start = e.lho + 30 + ln + le;
        var raw = u8.subarray(start, start + e.csize);
        if (e.method === 0) { out.set(e.name, raw); return; }
        if (e.method !== 8) throw new Error('지원하지 않는 압축 방식입니다: ' + e.method);
        return inflateRaw(raw).then(function (d) { out.set(e.name, d); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /* ------------------------------------------------------------ XLSX 쓰기 */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // 엑셀이 허용하지 않는 제어문자 제거
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colLetter(idx) {
    var s = '', n = idx + 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  function sheetXml(rows) {
    var body = rows.map(function (row, r) {
      var cells = (row || []).map(function (val, c) {
        if (val === null || val === undefined || val === '') return '';
        var ref = colLetter(c) + (r + 1);
        if (typeof val === 'number' && isFinite(val)) {
          return '<c r="' + ref + '"><v>' + val + '</v></c>';
        }
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(val) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');

    var widths = '';
    var maxCols = rows.reduce(function (a, r) { return Math.max(a, (r || []).length); }, 0);
    if (maxCols) {
      widths = '<cols>' + Array.from({ length: maxCols }, function (_, i) {
        var w = rows.reduce(function (a, r) {
          var v = r && r[i] != null ? String(r[i]) : '';
          return Math.max(a, v.length + (/[가-힣]/.test(v) ? v.replace(/[^가-힣]/g, '').length : 0));
        }, 6);
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(52, w + 2) + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      widths + '<sheetData>' + body + '</sheetData></worksheet>';
  }

  function safeSheetName(name, idx) {
    var s = String(name || ('Sheet' + (idx + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').trim();
    if (!s) s = 'Sheet' + (idx + 1);
    return s.slice(0, 31);
  }

  /**
   * sheets: [{ name, rows: [[...], ...] }]  ->  Blob(.xlsx)
   */
  function buildWorkbook(sheets) {
    var used = {};
    var names = sheets.map(function (s, i) {
      var base = safeSheetName(s.name, i), name = base, k = 2;
      while (used[name]) { name = base.slice(0, 28) + '_' + (k++); }
      used[name] = true;
      return name;
    });

    var files = [];
    files.push({
      name: '[Content_Types].xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (_, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>')
    });

    files.push({
      name: '_rels/.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>')
    });

    files.push({
      name: 'xl/workbook.xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) {
          return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>')
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>')
    });

    files.push({
      name: 'xl/styles.xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '</styleSheet>')
    });

    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(s.rows || [])) });
    });

    return zipWrite(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /* ------------------------------------------------------------ XLSX 읽기 */
  function refToCol(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return 0;
    var s = m[1], n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function parseXml(u8) {
    return new DOMParser().parseFromString(dec.decode(u8), 'application/xml');
  }

  function textOf(node) {
    // <si> 안의 여러 <t> 조각을 이어붙인다 (rPh 등 발음 정보는 제외)
    var ts = node.getElementsByTagName('t');
    var out = '';
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].parentNode && ts[i].parentNode.nodeName === 'rPh') continue;
      out += ts[i].textContent;
    }
    return out;
  }

  /**
   * ArrayBuffer(.xlsx) -> Promise<{sheets:[{name, rows:[[string]]}]}>
   */
  function readWorkbook(buffer) {
    return zipRead(buffer).then(function (zip) {
      var shared = [];
      var ssFile = zip.get('xl/sharedStrings.xml');
      if (ssFile) {
        var sdoc = parseXml(ssFile);
        var sis = sdoc.getElementsByTagName('si');
        for (var i = 0; i < sis.length; i++) shared.push(textOf(sis[i]));
      }

      var wb = zip.get('xl/workbook.xml');
      if (!wb) throw new Error('엑셀 파일 구조를 읽을 수 없습니다.');
      var wdoc = parseXml(wb);
      var rels = {};
      var relFile = zip.get('xl/_rels/workbook.xml.rels');
      if (relFile) {
        var rdoc = parseXml(relFile);
        var rs = rdoc.getElementsByTagName('Relationship');
        for (var r = 0; r < rs.length; r++) rels[rs[r].getAttribute('Id')] = rs[r].getAttribute('Target');
      }

      var sheetNodes = wdoc.getElementsByTagName('sheet');
      var sheets = [];
      for (var s = 0; s < sheetNodes.length; s++) {
        var node = sheetNodes[s];
        var rid = node.getAttribute('r:id') || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var target = rels[rid] || ('worksheets/sheet' + (s + 1) + '.xml');
        target = String(target).replace(/^\//, '').replace(/^xl\//, '');
        var file = zip.get('xl/' + target);
        if (!file) continue;
        sheets.push({ name: node.getAttribute('name') || ('Sheet' + (s + 1)), rows: parseSheet(parseXml(file), shared) });
      }
      return { sheets: sheets };
    });
  }

  function parseSheet(doc, shared) {
    var rows = [];
    var rowNodes = doc.getElementsByTagName('row');
    for (var i = 0; i < rowNodes.length; i++) {
      var rn = rowNodes[i];
      var rIdx = parseInt(rn.getAttribute('r') || (i + 1), 10) - 1;
      var cells = rn.getElementsByTagName('c');
      var row = [];
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var col = c.getAttribute('r') ? refToCol(c.getAttribute('r')) : j;
        var t = c.getAttribute('t');
        var val = '';
        if (t === 'inlineStr') {
          val = textOf(c);
        } else if (t === 's') {
          var vEl = c.getElementsByTagName('v')[0];
          var idx = vEl ? parseInt(vEl.textContent, 10) : -1;
          val = shared[idx] != null ? shared[idx] : '';
        } else if (t === 'str') {
          var f = c.getElementsByTagName('v')[0];
          val = f ? f.textContent : '';
        } else {
          var v2 = c.getElementsByTagName('v')[0];
          val = v2 ? v2.textContent : '';
        }
        row[col] = val == null ? '' : String(val).trim();
      }
      for (var k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = '';
      rows[rIdx] = row;
    }
    for (var m = 0; m < rows.length; m++) if (!rows[m]) rows[m] = [];
    return rows;
  }

  /** 엑셀 날짜 일련번호 -> YYYY-MM-DD */
  function serialToDate(n) {
    var num = Number(n);
    if (!isFinite(num) || num <= 0 || num > 60000) return null;
    var ms = Math.round((num - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  global.XlsxLite = {
    buildWorkbook: buildWorkbook,
    readWorkbook: readWorkbook,
    zipWrite: zipWrite,
    zipRead: zipRead,
    serialToDate: serialToDate
  };
})(window);
