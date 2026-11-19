const $ = (s, r = document) => r.querySelector(s);
const menuBtn = $(".menu"),
  navLinks = $(".links");
if (menuBtn && navLinks) {
  menuBtn.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.textContent = open ? "×" : "☰";
  });
  navLinks.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.textContent = "☰";
    }),
  );
}
document
  .querySelectorAll("[data-year]")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

async function post(url, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(j.error || "Something went wrong. Please try again.");
  return j;
}
function status(el, msg) {
  el.style.display = "block";
  el.textContent = msg;
}
function busy(form, on) {
  const b = form.querySelector("button[type=submit]");
  if (b) b.disabled = on;
}

// Donation form: we only collect name, email and amount. The donor chooses
// MTN, Airtel, card or bank and enters those details on Pesapal's own page.
let selectedAmount = "25000";
document.querySelectorAll("[data-amount]").forEach((b) =>
  b.addEventListener("click", () => {
    selectedAmount = b.dataset.amount;
    document
      .querySelectorAll("[data-amount]")
      .forEach((x) => x.classList.toggle("active", x === b));
    const c = $("#customField");
    if (c) c.hidden = selectedAmount !== "custom";
  }),
);
const donationForm = $("#donationForm");
if (donationForm)
  donationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = $("#donateStatus");
    const amount =
      selectedAmount === "custom"
        ? Number($("#customAmount").value)
        : Number(selectedAmount);
    if (!Number.isInteger(amount) || amount < 1000)
      return status(
        st,
        "Please choose or enter a whole-number donation of at least UGX 1,000.",
      );
    busy(donationForm, true);
    status(st, "Preparing your secure payment page…");
    try {
      const j = await post("/api/donate", {
        name: $("#donorName").value,
        email: $("#donorEmail").value,
        amount,
      });
      if (!j.redirectUrl)
        throw new Error(
          "We could not start the payment. Please try again shortly.",
        );
      window.location.href = j.redirectUrl;
      return;
    } catch (err) {
      status(st, err.message);
    }
    busy(donationForm, false);
  });

// Contact form
const contactForm = $("#contactForm");
if (contactForm)
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(contactForm, true);
    const st = $("#contactStatus");
    try {
      const j = await post("/api/contact", {
        name: $("#contactName").value,
        email: $("#contactEmail").value,
        topic: $("#topic").value,
        message: $("#message").value,
      });
      status(st, j.message);
      contactForm.reset();
    } catch (err) {
      status(st, err.message);
    }
    busy(contactForm, false);
  });

// Newsletter (footer, every page)
const news = $("#newsletterForm");
if (news)
  news.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(news, true);
    const st = $("#newsletterStatus");
    try {
      const j = await post("/api/newsletter", {
        email: $("#newsletterEmail").value,
      });
      status(st, j.message);
      news.reset();
    } catch (err) {
      status(st, err.message);
    }
    busy(news, false);
  });

// Stories + reports from the database
function mk(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const directPayments = $("#directPayments");
if (directPayments)
  fetch("/api/payment-methods")
    .then((r) => r.json())
    .then((items) => {
      if (!Array.isArray(items) || !items.length) return;
      const list = $("#directPaymentMethods");
      items.forEach((m) => {
        const card = mk("article", "payment-account");
        card.append(mk("h4", "", m.label));
        if (m.blurb) card.append(mk("p", "", m.blurb));
        const account = mk("dl");
        account.append(
          mk("dt", "", m.type === "bank" ? "Account name" : "Registered name"),
          mk("dd", "", m.account_name),
        );
        account.append(
          mk(
            "dt",
            "",
            m.type === "bank" ? "Account number" : "Mobile money number",
          ),
          mk("dd", "", m.account_number),
        );
        card.append(account);
        if (m.details) card.append(mk("pre", "", m.details));
        if (m.instructions) card.append(mk("p", "", m.instructions));
        list.append(card);
      });
      directPayments.hidden = false;
    })
    .catch(() => {});
const storyList = $("#storyList");
if (storyList)
  fetch("/api/stories")
    .then((r) => r.json())
    .then((items) => {
      storyList.textContent = "";
      if (!items.length) {
        const d = mk("div", "empty-state");
        d.style.gridColumn = "1/-1";
        d.append(
          mk("strong", "", "Stories are coming soon."),
          mk("p", "", "We will share approved school news and updates here."),
        );
        storyList.append(d);
        return;
      }
      items.forEach((s) => {
        const card = mk("article", "card");
        if (s.image_url) {
          const w = mk("div", "card-image"),
            i = document.createElement("img");
          i.src = s.image_url;
          i.alt = "";
          i.loading = "lazy";
          w.append(i);
          card.append(w);
        }
        const b = mk("div", "card-body");
        if (s.tag) b.append(mk("span", "tag", s.tag));
        b.append(mk("h3", "", s.title), mk("p", "", s.summary));
        card.append(b);
        storyList.append(card);
      });
    })
    .catch(() => {});
const reportList = $("#reportList");
if (reportList)
  fetch("/api/reports")
    .then((r) => r.json())
    .then((items) => {
      if (!items.length) return;
      reportList.textContent = "";
      reportList.className = "cards";
      items.forEach((x) => {
        const card = mk("article", "card"),
          b = mk("div", "card-body"),
          a = mk("a", "text-link", "Open report ↗");
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener";
        b.append(
          mk("span", "tag", x.year || "Report"),
          mk("h3", "", x.title),
          a,
        );
        card.append(b);
        reportList.append(card);
      });
    })
    .catch(() => {});

// Thank-you page: Pesapal sends the donor back with ?OrderMerchantReference=…
// We poll our own status endpoint, which re-checks the real status with Pesapal.
const tyTitle = $("#tyTitle");
if (tyTitle) {
  const tyMsg = $("#tyMsg"),
    tyStatus = $("#tyStatus");
  const ref = new URLSearchParams(location.search).get(
    "OrderMerchantReference",
  );
  let tries = 0;
  const show = (title, msg, note) => {
    tyTitle.textContent = title;
    tyMsg.textContent = msg;
    tyStatus.textContent = note;
  };
  const check = async () => {
    try {
      const r = await fetch(
        "/api/donation-status?ref=" + encodeURIComponent(ref),
      );
      const d = await r.json().catch(() => ({}));
      if (d.status === "successful")
        return show(
          "Thank you for your gift!",
          "Your donation of " +
            d.currency +
            " " +
            Number(d.amount).toLocaleString() +
            " was received. You are helping children learn and grow.",
          "Payment confirmed.",
        );
      if (d.status === "failed" || d.status === "reversed")
        return show(
          "Payment not completed",
          "Your payment did not go through, and you have not been charged for a completed gift. You are welcome to try again.",
          "Payment status: " + d.status + ".",
        );
      retry();
    } catch {
      retry();
    }
  };
  const retry = () => {
    if (++tries < 8) setTimeout(check, 3000);
    else
      show(
        "We are still confirming your payment",
        "Mobile money payments can take a few minutes. If you approved the payment, it will be recorded once confirmed.",
        "Still pending.",
      );
  };
  if (!ref)
    show(
      "Thank you",
      "If you completed a payment, we will confirm it shortly.",
      "We could not look up this payment.",
    );
  else check();
}
