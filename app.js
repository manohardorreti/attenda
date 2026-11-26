const $ = (id) => document.getElementById(id);
const KEY = 'internAttendanceDashboard_v1';

let data = {
  settings: {
    name: '',
    start: '',
    target: 300,
    asOf: new Date().toISOString().slice(0, 10)
  },
  attendance: {},
  payments: [],
  filter: { from: '', to: '' },
  payFilter: { from: '', to: '' }
};

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x) {
      data = {
        ...data,
        ...x,
        settings: { ...data.settings, ...(x.settings || {}) },
        filter: { ...data.filter, ...(x.filter || {}) },
        payFilter: { ...data.payFilter, ...(x.payFilter || {}) }
      };
    }
  } catch (e) {
    console.error('Failed to load saved data:', e);
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function dateObj(s) {
  return new Date(s + 'T12:00:00');
}

function iso(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function fmt(s) {
  return s
    ? dateObj(s).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '—';
}

function isWork(s) {
  const d = dateObj(s);
  return d.getDay() !== 0 && !(d.getDay() === 6 && Math.ceil(d.getDate() / 7) === 2);
}

function cycleFor(s) {
  const d = dateObj(s);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 25) {
    const prev = new Date(y, m - 1, 26);
    const end = new Date(y, m, 25);
    return {
      start: iso(prev),
      end: iso(end),
      label: fmt(iso(prev)) + ' – ' + fmt(iso(end))
    };
  }
  const st = new Date(y, m, 26);
  const en = new Date(y, m + 1, 25);
  return {
    start: iso(st),
    end: iso(en),
    label: fmt(iso(st)) + ' – ' + fmt(iso(en))
  };
}

function eachDate(a, b, fn) {
  if (!a || !b) return;
  const d = dateObj(a);
  const end = dateObj(b);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    fn(iso(d), new Date(d));
  }
}

function workingDates(a, b) {
  const arr = [];
  eachDate(a, b, (s) => {
    if (isWork(s)) arr.push(s);
  });
  return arr;
}

// Returns 0.5 CL if the internship starts between 21st July and 25th July, otherwise 1 CL
function monthlyClAccrual(year, monthIndex) {
  if (!data.settings.start) return 1;
  const start = dateObj(data.settings.start);
  if (
    start.getFullYear() === year &&
    start.getMonth() === monthIndex &&
    monthIndex === 6 && // July (0-indexed: Jan=0 ... Jul=6)
    start.getDate() >= 21 &&
    start.getDate() <= 25
  ) {
    return 0.5;
  }
  return 1;
}

function clEarned(asOf) {
  if (!data.settings.start) return 0;
  const start = dateObj(data.settings.start);
  const end = dateObj(asOf);
  if (end < start) return 0;
  let n = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    n += monthlyClAccrual(cur.getFullYear(), cur.getMonth());
    cur.setMonth(cur.getMonth() + 1);
  }
  return n;
}

function calc() {
  const s = data.settings.start;
  const as = data.settings.asOf;
  if (!s) return null;

  const days = workingDates(s, as);
  const cl = clEarned(as);
  let used = 0;
  let lop = 0;
  let att = 0;
  let leave = 0;
  let balance = 0;
  let lastMonth = '';
  const rows = [];

  days.forEach((dt) => {
    const month = dt.slice(0, 7);
    if (month !== lastMonth) {
      const dObj = dateObj(dt);
      balance += monthlyClAccrual(dObj.getFullYear(), dObj.getMonth());
      lastMonth = month;
    }

    const r = data.attendance[dt] || {
      status: 'Unmarked',
      leaveType: '',
      permission: 'No',
      exam: 'No',
      remarks: ''
    };
    let clUsed = 0;
    let penalty = 0;

    if (r.status === 'Present') {
      att++;
    } else if (r.status === 'Leave' || r.status === 'Absent') {
      leave++;
      if (r.permission === 'No') {
        penalty = 5;
      } else if (balance >= 1) {
        balance -= 1;
        clUsed = 1;
        used += 1;
      } else if (balance > 0) {
        // Uses remaining 0.5 CL, and the uncovered 0.5 becomes LOP
        clUsed = balance;
        used += balance;
        penalty = 1 - balance;
        balance = 0;
      } else {
        penalty = 1;
      }
    }

    lop += penalty;
    rows.push({ date: dt, r, clUsed, penalty });
  });

  return { days, rows, cl, balance, used, lop, att, leave };
}

function targetDate(extra) {
  const start = data.settings.start;
  const target = +data.settings.target || 300;
  if (!start) return '—';
  let count = 0;
  const d = dateObj(start);
  let limit = 0;
  const totalNeeded = Math.ceil(target + extra);
  while (count < totalNeeded && limit < 3000) {
    const st = iso(d);
    if (isWork(st)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
    limit++;
  }
  return fmt(iso(new Date(d.getTime() - 86400000)));
}

function currency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function render() {
  const c = calc();
  $('internName').value = data.settings.name;
  $('startDate').value = data.settings.start;
  $('targetDays').value = data.settings.target;
  $('asOf').value = data.settings.asOf;
  $('filterFrom').value = data.filter.from;
  $('filterTo').value = data.filter.to;
  $('payFilterFrom').value = data.payFilter.from;
  $('payFilterTo').value = data.payFilter.to;

  if (!c) {
    ['sWorking', 'sAttended', 'sLeave', 'sCL', 'sPenalty', 'sEarn', 'sTarget', 'sExtended'].forEach(
      (x) => ($(x).textContent = '—')
    );
    $('attendanceRows').innerHTML =
      '<tr><td colspan="9">Enter internship start date and generate attendance.</td></tr>';
    renderPayments();
    return;
  }

  $('sWorking').textContent = c.days.length;
  $('sAttended').textContent = c.att;
  $('sLeave').textContent = c.leave;
  $('sCL').textContent = c.balance + ' day(s)';
  $('sPenalty').textContent = c.lop + ' day(s)';
  $('sEarn').textContent = currency(
    data.payments.reduce((a, p) => a + Number(p.amount || 0), 0)
  );
  $('sTarget').textContent = targetDate(0);
  $('sExtended').textContent = targetDate(c.lop);

  const from = data.filter.from;
  const to = data.filter.to;
  const rows = c.rows.filter((x) => (!from || x.date >= from) && (!to || x.date <= to));

  $('attendanceRows').innerHTML =
    rows
      .map(
        ({ date, r, clUsed, penalty }) => `<tr data-date="${date}">
          <td>${fmt(date)}</td>
          <td>${dateObj(date).toLocaleDateString('en-IN', { weekday: 'short' })}</td>
          <td>
            <select data-k="status">
              <option ${r.status === 'Unmarked' ? 'selected' : ''}>Unmarked</option>
              <option ${r.status === 'Present' ? 'selected' : ''}>Present</option>
              <option ${r.status === 'Leave' ? 'selected' : ''}>Leave</option>
              <option ${r.status === 'Absent' ? 'selected' : ''}>Absent</option>
            </select>
          </td>
          <td>
            <select data-k="leaveType">
              <option value="" ${!r.leaveType ? 'selected' : ''}>—</option>
              <option ${r.leaveType === 'Personal' ? 'selected' : ''}>Personal</option>
              <option ${r.leaveType === 'Medical' ? 'selected' : ''}>Medical</option>
              <option ${r.leaveType === 'College exam' ? 'selected' : ''}>College exam</option>
              <option ${r.leaveType === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </td>
          <td>
            <select data-k="permission">
              <option ${r.permission === 'No' ? 'selected' : ''}>No</option>
              <option ${r.permission === 'Yes' ? 'selected' : ''}>Yes</option>
            </select>
          </td>
          <td>
            <select data-k="exam">
              <option ${r.exam === 'No' ? 'selected' : ''}>No</option>
              <option ${r.exam === 'Yes' ? 'selected' : ''}>Yes</option>
            </select>
          </td>
          <td><span class="pill ${clUsed ? 'warn' : ''}">${clUsed ? clUsed + ' day' : '—'}</span></td>
          <td><span class="pill ${penalty ? 'bad' : 'ok'}">${penalty ? '×' + penalty : '—'}</span></td>
          <td><input class="tiny" data-k="remarks" value="${(r.remarks || '').replaceAll('"', '&quot;')}" placeholder="Remarks"></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="9">No working days in this date range.</td></tr>';

  $('attendanceRows')
    .querySelectorAll('tr[data-date]')
    .forEach((tr) =>
      tr.querySelectorAll('[data-k]').forEach((el) =>
        el.addEventListener('change', () => {
          const d = tr.dataset.date;
          data.attendance[d] = data.attendance[d] || {
            status: 'Unmarked',
            leaveType: '',
            permission: 'No',
            exam: 'No',
            remarks: ''
          };
          data.attendance[d][el.dataset.k] = el.value;
          save();
          render();
        })
      )
    );

  renderPayments();
}

function renderPayments() {
  const pFrom = data.payFilter.from;
  const pTo = data.payFilter.to;

  // Keep original index so delete works accurately even when filtered
  const indexedPayments = data.payments
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => (!pFrom || p.date >= pFrom) && (!pTo || p.date <= pTo));

  const filteredTotal = indexedPayments.reduce((a, p) => a + Number(p.amount || 0), 0);

  if (pFrom || pTo) {
    $('payInfo').textContent = `Filtered total (${pFrom ? fmt(pFrom) : 'Start'} to ${
      pTo ? fmt(pTo) : 'Latest'
    }): ${currency(filteredTotal)} across ${indexedPayments.length} credit(s).`;
  } else {
    $('payInfo').textContent = `Showing all ${indexedPayments.length} salary credit(s). Total: ${currency(
      filteredTotal
    )}.`;
  }

  $('payRows').innerHTML =
    indexedPayments
      .map((p) => {
        const cyc = cycleFor(p.date);
        const n = workingDates(cyc.start, cyc.end).length;
        return `<tr>
          <td>${fmt(p.date)}</td>
          <td>${cyc.label}</td>
          <td>${currency(p.amount)}</td>
          <td>${currency(n ? Number(p.amount) / n : 0)} <small>(${n} days)</small></td>
          <td><button class="danger" data-del="${p.idx}">Delete</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="5">No salary credits in this date range.</td></tr>';

  $('payRows')
    .querySelectorAll('[data-del]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          data.payments.splice(+b.dataset.del, 1);
          save();
          render();
        })
    );
}

// Event Listeners
$('saveSettings').onclick = () => {
  data.settings = {
    name: $('internName').value,
    start: $('startDate').value,
    target: +$('targetDays').value || 300,
    asOf: $('asOf').value || new Date().toISOString().slice(0, 10)
  };
  save();
  render();
};

$('generate').onclick = () => {
  data.settings = {
    name: $('internName').value,
    start: $('startDate').value,
    target: +$('targetDays').value || 300,
    asOf: $('asOf').value || new Date().toISOString().slice(0, 10)
  };
  if (data.settings.start) {
    eachDate(data.settings.start, data.settings.asOf, (d) => {
      if (isWork(d) && !data.attendance[d]) {
        data.attendance[d] = {
          status: 'Unmarked',
          leaveType: '',
          permission: 'No',
          exam: 'No',
          remarks: ''
        };
      }
    });
  }
  save();
  render();
};

$('addPay').onclick = () => {
  const date = $('payDate').value;
  const amount = Number($('payAmount').value);
  if (!date || !Number.isFinite(amount) || amount < 0) {
    alert('Enter a valid credit date and amount.');
    return;
  }
  data.payments.push({ date, amount, note: $('payNote').value });
  save();
  $('payDate').value = '';
  $('payAmount').value = '';
  $('payNote').value = '';
  render();
};

$('applyPayFilter').onclick = () => {
  data.payFilter = { from: $('payFilterFrom').value, to: $('payFilterTo').value };
  save();
  render();
};

$('clearPayFilter').onclick = () => {
  data.payFilter = { from: '', to: '' };
  $('payFilterFrom').value = '';
  $('payFilterTo').value = '';
  save();
  render();
};

$('applyFilter').onclick = () => {
  data.filter = { from: $('filterFrom').value, to: $('filterTo').value };
  save();
  render();
};

$('clearFilter').onclick = () => {
  data.filter = { from: '', to: '' };
  $('filterFrom').value = '';
  $('filterTo').value = '';
  save();
  render();
};

$('export').onclick = () => {
  const c = calc();
  if (!c) {
    alert('Set a start date first.');
    return;
  }
  const lines = [
    [
      'Date',
      'Day',
      'Status',
      'Leave type',
      'Prior permission',
      'College exam notice',
      'CL used',
      'LOP penalty',
      'Remarks'
    ]
  ];
  c.rows.forEach((x) =>
    lines.push([
      x.date,
      dateObj(x.date).toLocaleDateString('en-IN', { weekday: 'long' }),
      x.r.status,
      x.r.leaveType,
      x.r.permission,
      x.r.exam,
      x.clUsed,
      x.penalty,
      x.r.remarks
    ])
  );
  const csv = lines
    .map((row) => row.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(','))
    .join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'intern-attendance.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

// JSON Backup & Restore
$('backupJson').onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `intern-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$('restoreBtn').onclick = () => $('restoreFile').click();

$('restoreFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed && parsed.settings) {
        data = {
          ...data,
          ...parsed,
          filter: parsed.filter || { from: '', to: '' },
          payFilter: parsed.payFilter || { from: '', to: '' }
        };
        save();
        render();
        alert('Data restored successfully!');
      } else {
        alert('Invalid backup file.');
      }
    } catch {
      alert('Could not read JSON file.');
    }
  };
  reader.readAsText(file);
};

$('reset').onclick = () => {
  if (confirm('Delete all attendance, salary and settings saved in this browser?')) {
    localStorage.removeItem(KEY);
    data = {
      settings: { name: '', start: '', target: 300, asOf: new Date().toISOString().slice(0, 10) },
      attendance: {},
      payments: [],
      filter: { from: '', to: '' },
      payFilter: { from: '', to: '' }
    };
    render();
  }
};

load();
render();
