// ─── STATE ───────────────────────────────────────────────────────────────────
const SEED_MONEY = 75000;
const CONTRIBUTION = 10000;
const TOTAL_WEEKS = 20;
const LOAN_INTEREST = 0.3;
const LOAN_TERM_WEEKS = 5;

let state = loadState() || {
  currentWeek: 0,
  members: [],
  loans: [], // { id, memberId, principal, issued_week, due_week, status, repayments: [] }
  contributions: {}, // { memberId: { week: amount_paid } }
  nextLoanId: 1,
};

function saveState() {
  localStorage.setItem("village_bank_v2", JSON.stringify(state));
}
function loadState() {
  try {
    const s = localStorage.getItem("village_bank_v2");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n) {
  return "MWK " + Math.round(n).toLocaleString();
}
function fmtN(n) {
  return Math.round(n).toLocaleString();
}

function getMember(id) {
  return state.members.find((m) => m.id === id);
}

function getActiveLoans(memberId) {
  return state.loans.filter(
    (l) => l.memberId === memberId && l.status === "active",
  );
}

function memberBalance(memberId) {
  // Sum of outstanding balances on active loans
  return getActiveLoans(memberId).reduce((s, l) => s + loanOutstanding(l), 0);
}

function loanOutstanding(loan) {
  const totalDue = loan.principal * (1 + LOAN_INTEREST);
  const repaid = loan.repayments.reduce((s, r) => s + r.amount, 0);
  return Math.max(0, totalDue - repaid);
}

function loanTotalDue(loan) {
  return loan.principal * (1 + LOAN_INTEREST);
}

function totalContributions() {
  let total = 0;
  state.members.forEach((m) => {
    for (let w = 1; w <= state.currentWeek; w++) {
      total += state.contributions[m.id]?.[w] || 0;
    }
  });
  return total;
}

function totalInterestEarned() {
  let total = 0;
  state.loans.forEach((l) => {
    const interest = l.principal * LOAN_INTEREST;
    const repaid = l.repayments.reduce((s, r) => s + r.amount, 0);
    const principalPaid = Math.min(repaid, l.principal);
    const interestPaid = Math.max(0, repaid - principalPaid);
    // Actually simpler: count all received as (repaid - principal portion)
    // We track fully paid loans as interest = principal * rate, partial = repaid portion above principal
    if (l.status === "paid") {
      total += interest;
    } else {
      total += Math.max(0, repaid - l.principal);
    }
  });
  return total;
}

function poolTotal() {
  return SEED_MONEY + totalContributions() + totalInterestEarned();
}

function memberContribMissed(memberId) {
  let missed = 0;
  for (let w = 1; w <= state.currentWeek; w++) {
    const paid = state.contributions[memberId]?.[w] || 0;
    if (paid < CONTRIBUTION) missed += CONTRIBUTION - paid;
  }
  return missed;
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
let activeTab = "dashboard";
let viewedWeek = 1;

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((el, i) => {
    el.classList.toggle(
      "active",
      ["dashboard", "members", "loans", "weekly", "sharing"][i] === tab,
    );
  });
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + tab).classList.add("active");
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === "dashboard") renderDashboard();
  else if (tab === "members") renderMembers();
  else if (tab === "loans") renderLoans();
  else if (tab === "weekly") renderWeekly();
  else if (tab === "sharing") renderSharing();
}

function renderAll() {
  document.getElementById("header-week").textContent =
    `Week ${state.currentWeek} of ${TOTAL_WEEKS}`;
  document.getElementById("next-week-btn").textContent = state.currentWeek + 1;
  renderTab(activeTab);
}

// ─── WEEK ADVANCE ─────────────────────────────────────────────────────────────
function advanceWeek() {
  if (state.currentWeek >= TOTAL_WEEKS) {
    alert("The 14-week cycle is complete. View the End-of-Cycle Share tab.");
    return;
  }
  state.currentWeek++;
  viewedWeek = state.currentWeek;

  // For each member, if they haven't paid their contribution yet, we'll show it as pending
  // Missed contributions automatically become loans at end of each week check
  state.members.forEach((m) => {
    const paid = state.contributions[m.id]?.[state.currentWeek] || 0;
    if (paid < CONTRIBUTION) {
      const missed = CONTRIBUTION - paid;
      // Create a loan for the missed contribution
      createLoan(m.id, missed, `Missed contribution week ${state.currentWeek}`);
    }
  });

  // Check for overdue loans and roll them over
  state.loans.forEach((loan) => {
    if (loan.status === "active" && state.currentWeek > loan.due_week) {
      const outstanding = loanOutstanding(loan);
      if (outstanding > 0) {
        loan.status = "rolled";
        createLoan(
          loan.memberId,
          outstanding,
          `Rollover from loan #${loan.id}`,
        );
      }
    }
  });

  saveState();
  renderAll();
}

function createLoan(memberId, principal, note) {
  if (principal <= 0) return;
  state.loans.push({
    id: state.nextLoanId++,
    memberId,
    principal,
    issued_week: state.currentWeek,
    due_week: state.currentWeek + LOAN_TERM_WEEKS,
    status: "active",
    note: note || "",
    repayments: [],
  });
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function renderDashboard() {
  const activeLoans = state.loans.filter((l) => l.status === "active");
  const totalOutstanding = activeLoans.reduce(
    (s, l) => s + loanOutstanding(l),
    0,
  );

  document.getElementById("dash-stats").innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Pool (Seed + Contributions + Interest)</div>
      <div class="stat-val">${fmt(poolTotal())}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Seed Money</div>
      <div class="stat-val">${fmt(SEED_MONEY)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Contributions Collected</div>
      <div class="stat-val">${fmt(totalContributions())}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Interest Earned</div>
      <div class="stat-val">${fmt(totalInterestEarned())}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Outstanding Loans</div>
      <div class="stat-val">${fmt(totalOutstanding)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Members</div>
      <div class="stat-val">${state.members.length}</div>
    </div>
  `;

  // Alerts
  let alerts = "";
  if (state.currentWeek === 0) {
    alerts =
      '<div class="alert alert-amber">Click "Advance to Week 1" to begin the cycle and record week 1 contributions.</div>';
  }
  const overdueLoans = activeLoans.filter(
    (l) => l.due_week < state.currentWeek,
  );
  if (overdueLoans.length) {
    alerts += `<div class="alert alert-red">⚠ ${overdueLoans.length} loan(s) are overdue. They will roll over when you advance the week.</div>`;
  }
  if (state.currentWeek >= TOTAL_WEEKS) {
    alerts += `<div class="alert alert-green">✓ 14-week cycle complete! Go to "End-of-Cycle Share" to distribute funds.</div>`;
  }
  document.getElementById("dash-alerts").innerHTML = alerts;

  // Active loans table
  if (!activeLoans.length) {
    document.getElementById("dash-loans").innerHTML =
      '<div class="empty-state">No active loans.</div>';
    return;
  }
  let rows = activeLoans
    .map((l) => {
      const m = getMember(l.memberId);
      const owed = loanOutstanding(l);
      const overdue = l.due_week < state.currentWeek;
      return `<tr>
      <td>${m ? m.name : "?"}</td>
      <td>${fmt(l.principal)}</td>
      <td>${fmt(loanTotalDue(l))}</td>
      <td>${fmt(owed)}</td>
      <td>Week ${l.due_week}</td>
      <td>${overdue ? '<span class="badge badge-red">Overdue</span>' : '<span class="badge badge-amber">Active</span>'}</td>
      <td><button onclick="openRepay(${l.id})" style="padding:4px 10px;font-size:12px;">Repay</button></td>
    </tr>`;
    })
    .join("");

  document.getElementById("dash-loans").innerHTML = `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Member</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ─── MEMBERS ─────────────────────────────────────────────────────────────────
function openAddMember() {
  document.getElementById("add-member-form").style.display = "block";
}
function closeAddMember() {
  document.getElementById("add-member-form").style.display = "none";
}

function addMember() {
  const name = document.getElementById("new-member-name").value.trim();
  if (!name) {
    alert("Please enter a name.");
    return;
  }
  const phone = document.getElementById("new-member-phone").value.trim();
  const id = Date.now();
  state.members.push({ id, name, phone });
  state.contributions[id] = {};
  saveState();
  document.getElementById("new-member-name").value = "";
  document.getElementById("new-member-phone").value = "";
  closeAddMember();
  renderMembers();
}

function renderMembers() {
  if (!state.members.length) {
    document.getElementById("members-table").innerHTML =
      '<div class="empty-state">No members yet. Add the first member above.</div>';
    return;
  }
  let rows = state.members
    .map((m) => {
      const balance = memberBalance(m.id);
      const missed = memberContribMissed(m.id);
      return `<tr>
      <td><strong>${m.name}</strong>${m.phone ? `<br><span style="color:var(--text3);font-size:12px;">${m.phone}</span>` : ""}</td>
      <td>${missed > 0 ? `<span class="badge badge-amber">MWK ${fmtN(missed)} missed</span>` : '<span class="badge badge-green">Up to date</span>'}</td>
      <td>${balance > 0 ? `<span style="color:var(--red-600);font-weight:500;">${fmt(balance)}</span>` : '<span style="color:var(--green-600);">None</span>'}</td>
      <td><button class="secondary" style="padding:4px 10px;font-size:12px;" onclick="viewMember(${m.id})">View</button>
          <button onclick="openIssueLoanFor(${m.id})" style="padding:4px 10px;font-size:12px;">Loan</button></td>
    </tr>`;
    })
    .join("");
  document.getElementById("members-table").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Contributions</th><th>Loan Balance</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function viewMember(id) {
  const m = getMember(id);
  if (!m) return;
  const loans = state.loans.filter((l) => l.memberId === id);
  let contribRows = "";
  for (let w = 1; w <= state.currentWeek; w++) {
    const paid = state.contributions[id]?.[w] || 0;
    const status =
      paid >= CONTRIBUTION
        ? '<span class="badge badge-green">Paid</span>'
        : '<span class="badge badge-amber">Missed</span>';
    contribRows += `<tr><td>Week ${w}</td><td>${fmt(paid)}</td><td>${status}</td></tr>`;
  }
  let loanRows =
    loans
      .map((l) => {
        const owed = loanOutstanding(l);
        const badge =
          l.status === "paid"
            ? "badge-green"
            : l.status === "rolled"
              ? "badge-gray"
              : "badge-amber";
        return `<tr><td>#${l.id}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td><td>${fmt(owed)}</td><td>Wk ${l.due_week}</td><td><span class="badge ${badge}">${l.status}</span></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" style="color:var(--text3);">No loans</td></tr>';

  document.getElementById("modal-title").textContent = m.name;
  document.getElementById("modal-body").innerHTML = `
    ${m.phone ? `<p style="color:var(--text2);margin-bottom:12px;">${m.phone}</p>` : ""}
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:500;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Contributions</div>
      ${contribRows ? `<div class="table-wrap"><table><thead><tr><th>Week</th><th>Paid</th><th>Status</th></tr></thead><tbody>${contribRows}</tbody></table></div>` : '<p style="color:var(--text3);">No weeks recorded yet.</p>'}
    </div>
    <div>
      <div style="font-size:12px;font-weight:500;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Loans</div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Due</th><th>Status</th></tr></thead><tbody>${loanRows}</tbody></table></div>
    </div>
  `;
  document.getElementById("member-modal").classList.add("open");
}
function closeModal() {
  document.getElementById("member-modal").classList.remove("open");
}

// ─── LOANS ───────────────────────────────────────────────────────────────────
let loanTargetMemberId = null;

function openIssueLoan() {
  openIssueLoanFor(null);
}
function openIssueLoanFor(memberId) {
  loanTargetMemberId = memberId;
  const memberOptions = state.members
    .map(
      (m) =>
        `<option value="${m.id}" ${m.id === memberId ? "selected" : ""}>${m.name}</option>`,
    )
    .join("");
  document.getElementById("loan-modal-body").innerHTML = `
    <div class="form-group" style="margin-bottom:12px;">
      <label>Member</label>
      <select id="loan-member">${memberOptions}</select>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>Loan Amount (MWK)</label>
      <input type="number" id="loan-amount" placeholder="e.g. 20000" min="1000">
    </div>
    <div style="background:var(--blue-50);border-radius:var(--radius-sm);padding:10px;font-size:12px;color:var(--blue-800);margin-bottom:12px;">
      Interest: 30% → Total due = Principal × 1.30<br>
      Repayment due: Week ${state.currentWeek + LOAN_TERM_WEEKS}
    </div>
    <div class="modal-actions">
      <button class="secondary" onclick="closeLoanModal()">Cancel</button>
      <button onclick="issueLoansModal()">Issue Loan</button>
    </div>
  `;
  document.getElementById("loan-modal").classList.add("open");
}
function closeLoanModal() {
  document.getElementById("loan-modal").classList.remove("open");
}

function issueLoansModal() {
  if (state.currentWeek === 0) {
    alert("Advance to Week 1 first.");
    return;
  }
  const memberId = parseInt(document.getElementById("loan-member").value);
  const amount = parseFloat(document.getElementById("loan-amount").value);
  if (!memberId || !amount || amount <= 0) {
    alert("Please fill all fields.");
    return;
  }
  createLoan(memberId, amount, "Manual loan");
  saveState();
  closeLoanModal();
  renderAll();
}

function openRepay(loanId) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;
  const m = getMember(loan.memberId);
  const owed = loanOutstanding(loan);
  document.getElementById("repay-modal-body").innerHTML = `
    <p style="margin-bottom:12px;"><strong>${m?.name}</strong> — Loan #${loan.id}</p>
    <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px;font-size:13px;margin-bottom:12px;">
      Principal: ${fmt(loan.principal)}<br>
      Total due (30%): ${fmt(loanTotalDue(loan))}<br>
      <strong>Outstanding: ${fmt(owed)}</strong>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>Amount Paid (MWK)</label>
      <input type="number" id="repay-amount" value="${Math.round(owed)}" min="1">
    </div>
    <div class="modal-actions">
      <button class="secondary" onclick="closeRepayModal()">Cancel</button>
      <button onclick="recordRepay(${loanId})">Record Payment</button>
    </div>
  `;
  document.getElementById("repay-modal").classList.add("open");
}
function closeRepayModal() {
  document.getElementById("repay-modal").classList.remove("open");
}

function recordRepay(loanId) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;
  const amount = parseFloat(document.getElementById("repay-amount").value);
  if (!amount || amount <= 0) {
    alert("Enter a valid amount.");
    return;
  }
  loan.repayments.push({ week: state.currentWeek, amount });
  if (loanOutstanding(loan) <= 0) loan.status = "paid";
  saveState();
  closeRepayModal();
  renderAll();
}

function renderLoans() {
  if (!state.loans.length) {
    document.getElementById("loans-table").innerHTML =
      '<div class="empty-state">No loans issued yet.</div>';
    return;
  }
  let rows = state.loans
    .map((l) => {
      const m = getMember(l.memberId);
      const owed = loanOutstanding(l);
      const overdue = l.status === "active" && l.due_week < state.currentWeek;
      let badge = "badge-gray";
      if (l.status === "active") badge = overdue ? "badge-red" : "badge-amber";
      if (l.status === "paid") badge = "badge-green";
      if (l.status === "rolled") badge = "badge-gray";
      return `<tr>
      <td>#${l.id}</td>
      <td>${m ? m.name : "?"}</td>
      <td>${fmt(l.principal)}</td>
      <td>${fmt(loanTotalDue(l))}</td>
      <td>${fmt(owed)}</td>
      <td>Wk ${l.issued_week}</td>
      <td>Wk ${l.due_week}</td>
      <td><span class="badge ${badge}">${l.status}${overdue ? " ⚠" : ""}</span></td>
      <td>${l.note ? `<span style="color:var(--text3);font-size:11px;">${l.note}</span>` : ""}</td>
      <td>${l.status === "active" ? `<button onclick="openRepay(${l.id})" style="padding:3px 8px;font-size:11px;">Repay</button>` : ""}</td>
    </tr>`;
    })
    .join("");

  document.getElementById("loans-table").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Member</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Issued</th><th>Due</th><th>Status</th><th>Note</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ─── WEEKLY CONTRIBUTIONS ────────────────────────────────────────────────────
function navWeek(delta) {
  viewedWeek = Math.max(
    1,
    Math.min(state.currentWeek || 1, viewedWeek + delta),
  );
  renderWeekly();
}

function renderWeekly() {
  if (state.currentWeek === 0) {
    document.getElementById("weekly-table").innerHTML =
      '<div class="empty-state">Advance to Week 1 to record contributions.</div>';
    return;
  }
  viewedWeek = Math.max(1, Math.min(state.currentWeek, viewedWeek));
  document.getElementById("week-nav-label").textContent = `Week ${viewedWeek}`;

  if (!state.members.length) {
    document.getElementById("weekly-table").innerHTML =
      '<div class="empty-state">Add members first.</div>';
    return;
  }

  let rows = state.members
    .map((m) => {
      const paid = state.contributions[m.id]?.[viewedWeek] || 0;
      const status =
        paid >= CONTRIBUTION
          ? '<span class="badge badge-green">Paid</span>'
          : '<span class="badge badge-amber">Missed</span>';
      const canEdit = viewedWeek <= state.currentWeek;
      return `<tr>
      <td>${m.name}</td>
      <td>${status}</td>
      <td>${fmt(paid)}</td>
      <td>${canEdit && paid < CONTRIBUTION ? `<button onclick="recordContrib(${m.id},${viewedWeek})" style="padding:3px 8px;font-size:11px;">Mark Paid</button>` : ""}</td>
    </tr>`;
    })
    .join("");

  document.getElementById("weekly-table").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Member</th><th>Status</th><th>Amount</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function recordContrib(memberId, week) {
  if (!state.contributions[memberId]) state.contributions[memberId] = {};
  state.contributions[memberId][week] = CONTRIBUTION;
  // Remove auto-generated loan for this contribution if it was created
  const autoLoanIdx = state.loans.findIndex(
    (l) =>
      l.memberId === memberId &&
      l.note === `Missed contribution week ${week}` &&
      l.status === "active" &&
      l.repayments.length === 0,
  );
  if (autoLoanIdx > -1) state.loans.splice(autoLoanIdx, 1);
  saveState();
  renderWeekly();
  renderAll();
}

// ─── SHARING ─────────────────────────────────────────────────────────────────
function renderSharing() {
  const el = document.getElementById("sharing-content");
  if (state.currentWeek < TOTAL_WEEKS) {
    el.innerHTML = `<div class="alert alert-amber">The cycle ends at Week 14. Currently at Week ${state.currentWeek}.</div>`;
    return;
  }
  if (!state.members.length) {
    el.innerHTML = '<div class="empty-state">No members.</div>';
    return;
  }

  const pool = poolTotal();
  const n = state.members.length;
  const equalShare = pool / n;

  let rows = state.members
    .map((m) => {
      const debt = memberBalance(m.id);
      const netShare = Math.max(0, equalShare - debt);
      return `<tr>
      <td><strong>${m.name}</strong></td>
      <td>${fmt(equalShare)}</td>
      <td>${debt > 0 ? `<span style="color:var(--red-600);">${fmt(debt)}</span>` : "—"}</td>
      <td><strong>${fmt(netShare)}</strong></td>
    </tr>`;
    })
    .join("");

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Total Pool</div><div class="stat-val">${fmt(pool)}</div></div>
      <div class="stat-card"><div class="stat-label">Members</div><div class="stat-val">${n}</div></div>
      <div class="stat-card"><div class="stat-label">Equal Share Each</div><div class="stat-val">${fmt(equalShare)}</div></div>
    </div>
    <div style="background:var(--green-50);border:1px solid var(--green-200);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;color:var(--green-800);margin-bottom:4px;">
        Pool = Seed (${fmt(SEED_MONEY)}) + Contributions (${fmt(totalContributions())}) + Interest (${fmt(totalInterestEarned())}) = <strong>${fmt(pool)}</strong>
      </div>
      <div style="font-size:12px;color:var(--green-600);">
        Divided equally among ${n} member${n !== 1 ? "s" : ""} = ${fmt(equalShare)} each, minus any outstanding balances.
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Member</th><th>Equal Share</th><th>Deductions (Debts)</th><th>Net Payout</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
renderAll();
