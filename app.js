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
  filter: { from: '', to: '' }
};

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x) {
      data = {
        ...data,
        ...x,
        settings: { ...data.settings, ...(x.settings || {}) },
        filter: { ...data.filter, ...(x.filter || {}) }
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

function defaultCycleFor(s) {
  const d = dateObj(s);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 25) {
    const prev = new Date(y, m - 1, 26);
    const end = new Date(y, m, 25);
    return { start: iso(prev), end: iso(end) };
  }
  const st = new Date(y, m, 26);
  const en = new Date(y, m + 1, 25);
  return { start: iso(st), end: iso(en) };
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

// Grants 0.5 CL if internship start date is between 21st July and 25th July, else 1 CL
function monthlyClAccrual(year, monthIndex) {
  if (!data.settings.start) return 1;
  const start = dateObj(data.settings.start);
  if (
    start.getFullYear() === year &&
    start.getMonth() === monthIndex &&
    monthIndex === 6 && // July (0-indexed)
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

function updatePayPreview() {
  const from = $('payFrom').value;
  const to = $('payTo').value;
  const amount = Number($('payAmount').value);

  if (from && to) {
    if (to < from) {
      $('payInfo').textContent = 'Warning: "Duration To" cannot be earlier than "Duration From".';
      return;
    }
    const n = workingDates(from, to).length;
    if (Number.isFinite(amount) && amount > 0) {
      $('payInfo').textContent = `Duration: ${fmt(from)} – ${fmt(to)} (${n} working day${
        n === 1 ? '' : 's'
      }) → ${currency(n ? amount / n : 0)} per working day.`;
    } else {
      $('payInfo').textContent = `Duration: ${fmt(from)} – ${fmt(to)} (${n} working day${
        n === 1 ? '' : 's'
      }). Enter amount to see per-day earning.`;
    }
  } else {
    $('payInfo').textContent =
      'Select a credit date (auto-fills standard cycle) or set custom From/To dates and amount.';
  }
}

function render() {
  const c = calc();
  $('internName').value = data.settings.name;
  $('startDate').value = data.settings.start;
  $('targetDays').value = data.settings.target;
  $('asOf').value = data.settings.asOf;
  $('filterFrom').value = data.filter.from;
  $('filterTo').value = data.filter.to;

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
  $('payRows').innerHTML =
    data.payments
      .map((p, i) => {
        // Use saved custom duration (from/to) if present, else fallback to default cycle
        const fallback = defaultCycleFor(p.date);
        const start = p.from || fallback.start;
        const end = p.to || fallback.end;
        const n = workingDates(start, end).length;
        return `<tr>
          <td>${fmt(p.date)}</td>
          <td>${fmt(start)} – ${fmt(end)}</td>
          <td>${currency(p.amount)}</td>
          <td>${currency(n ? Number(p.amount) / n : 0)} <small>(${n} days)</small></td>
          <td><small>${(p.note || '').replaceAll('<', '&lt;')}</small></td>
          <td><button class="danger" data-del="${i}">Delete</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6">No salary credits entered.</td></tr>';

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

// Auto-populate default 26th–25th cycle when Credit Date changes (still editable)
$('payDate').addEventListener('change', () => {
  const val = $('payDate').value;
  if (val) {
    const cyc = defaultCycleFor(val);
    $('payFrom').value = cyc.start;
    $('payTo').value = cyc.end;
  }
  updatePayPreview();
});

$('payFrom').addEventListener('change', updatePayPreview);
$('payTo').addEventListener('change', updatePayPreview);
$('payAmount').addEventListener('input', updatePayPreview);

$('addPay').onclick = () => {
  const date = $('payDate').value;
  const from = $('payFrom').value;
  const to = $('payTo').value;
  const amount = Number($('payAmount').value);

  if (!date || !from || !to || !Number.isFinite(amount) || amount < 0) {
    alert('Enter a valid credit date, Duration From, Duration To, and amount.');
    return;
  }
  if (to < from) {
    alert('"Duration To" cannot be earlier than "Duration From".');
    return;
  }

  data.payments.push({
    date,
    from,
    to,
    amount,
    note: $('payNote').value
  });
  save();

  $('payDate').value = '';
  $('payFrom').value = '';
  $('payTo').value = '';
  $('payAmount').value = '';
  $('payNote').value = '';
  updatePayPreview();
  render();
};

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
          filter: parsed.filter || { from: '', to: '' }
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
      filter: { from: '', to: '' }
    };
    render();
  }
};

load();
render();
