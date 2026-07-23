/* ==========================================================================
   Allo Sanitaire Express 93 — main.js
   Menu mobile · scroll-reveal · capture UTM/gclid · garde anti-bot intégrée
   · validation stricte (tél FR + e-mail) · formulaire lead → Supabase
   ========================================================================== */
(function () {
  "use strict";

  var SUPABASE_URL = "https://xmkvaetrejjqymahbgvi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_tgF6sFFuzb5u0WhZSybqBg_X_79Xaeb";

  /* Délai minimal (ms) entre l'affichage de la page et un envoi humain plausible. */
  var MIN_FILL_MS = 3000;
  /* Nombre minimal d'interactions réelles (clavier / souris / tactile) avant envoi. */
  var MIN_INTERACTIONS = 3;
  /* Nombre max d'envois par session avant blocage silencieux. */
  var MAX_SUBMITS = 3;
  var BAN_KEY = "ase_ban";

  var pageLoadedAt = Date.now();

  /* ---------- Année ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var mobileNav = document.querySelector(".mobile-nav");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = mobileNav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- Ombre du header au scroll ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Scroll reveal ---------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
    /* Filet de sécurité : si l'observer ne s'est jamais déclenché (webview,
       onglet en arrière-plan…), on révèle tout pour ne jamais laisser une
       page blanche. */
    setTimeout(function () {
      if (!document.querySelector(".reveal.visible")) {
        revealEls.forEach(function (el) { el.classList.add("visible"); });
      }
    }, 1600);
  }

  /* ==========================================================================
     GARDE ANTI-BOT
     Signaux durs (navigateur piloté, UA headless) → bannissement immédiat.
     Signaux comportementaux (envoi trop rapide, zéro interaction, honeypot,
     rafale d'envois) → bannissement au moment du submit.
     Un banni reçoit un FAUX succès silencieux : aucune donnée envoyée à
     Supabase, aucune redirection vers merci.html (donc aucune conversion
     Google Ads comptée). Le ban est persistant via localStorage + cookie.
     ========================================================================== */

  var interactions = 0;
  ["pointerdown", "keydown", "touchstart", "mousemove", "scroll"].forEach(function (evt) {
    window.addEventListener(evt, function () { interactions++; }, { passive: true, once: false });
  });

  function store(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
    try { document.cookie = key + "=" + val + ";path=/;max-age=31536000;SameSite=Lax"; } catch (e) { /* ignore */ }
  }
  function readStore(key) {
    try { var v = localStorage.getItem(key); if (v) return v; } catch (e) { /* ignore */ }
    try {
      var m = document.cookie.match(new RegExp("(?:^|; )" + key + "=([^;]*)"));
      if (m) return m[1];
    } catch (e) { /* ignore */ }
    return null;
  }

  function banBot(reason) {
    store(BAN_KEY, reason || "1");
    /* Signale le bot à GTM : permet d'exclure ce trafic dans Google Ads / GA4. */
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "bot_detected", bot_reason: reason || "unknown" });
    } catch (e) { /* ignore */ }
  }

  function isBanned() {
    return !!readStore(BAN_KEY);
  }

  function hardBotSignal() {
    try {
      if (navigator.webdriver) return "webdriver";
      var ua = navigator.userAgent || "";
      if (/HeadlessChrome|PhantomJS|Electron|puppeteer|playwright|selenium|bot|crawl|spider|scrape/i.test(ua)) return "ua";
      if (!navigator.languages || navigator.languages.length === 0) return "no-lang";
      /* NB : pas de test outerWidth/outerHeight — les webviews in-app (Instagram,
         Facebook…) renvoient parfois 0 et on bannirait de vrais clients. */
    } catch (e) { /* ignore */ }
    return null;
  }

  /* Détection au chargement : un navigateur piloté est banni tout de suite. */
  var hardSignal = hardBotSignal();
  if (hardSignal) banBot(hardSignal);

  function submitCount() {
    try { return parseInt(sessionStorage.getItem("ase_submits") || "0", 10) || 0; } catch (e) { return 0; }
  }
  function bumpSubmitCount() {
    try { sessionStorage.setItem("ase_submits", String(submitCount() + 1)); } catch (e) { /* ignore */ }
  }

  /* ==========================================================================
     VALIDATION — vérificateurs téléphone FR + e-mail
     ========================================================================== */

  /* Format FR : 0X ou +33X suivi de 8 chiffres, séparateurs tolérés. */
  var RE_TEL_FR = /^(?:\+33|0033|0)\s*[1-9](?:[\s.\-]?\d{2}){4}$/;
  var RE_EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

  /* Domaines d'e-mails jetables les plus courants : refusés. */
  var DISPOSABLE = [
    "yopmail.com", "yopmail.fr", "mailinator.com", "jetable.org", "jetable.com",
    "tempmail.com", "temp-mail.org", "guerrillamail.com", "10minutemail.com",
    "throwawaymail.com", "trashmail.com", "maildrop.cc", "getnada.com",
    "sharklasers.com", "dispostable.com", "fakeinbox.com", "mytemp.email"
  ];

  function normalizeTel(v) {
    return String(v || "").replace(/[\s.\-()]/g, "");
  }

  function isFakeNumber(digits) {
    /* 10 fois le même chiffre, ou suites évidentes. */
    if (/^(\d)\1+$/.test(digits)) return true;
    var body = digits.slice(-8);
    if (/^(\d)\1+$/.test(body)) return true;
    if (["0123456789", "0612345678", "0712345678", "0102030405", "0611111111", "0600000000", "0699999999", "0700000000", "0799999999"].indexOf(digits) !== -1) return true;
    /* Paires identiques répétées : 06 12 12 12 12 */
    var pairs = body.match(/\d{2}/g) || [];
    if (pairs.length === 4 && pairs[0] === pairs[1] && pairs[1] === pairs[2] && pairs[2] === pairs[3]) return true;
    return false;
  }

  function checkTel(v) {
    var raw = String(v || "").trim();
    if (!raw) return "Merci d'indiquer votre numéro de téléphone.";
    if (!RE_TEL_FR.test(raw)) return "Numéro invalide — format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.";
    var digits = normalizeTel(raw).replace(/^\+33|^0033/, "0");
    if (digits.length !== 10) return "Le numéro doit comporter 10 chiffres.";
    if (isFakeNumber(digits)) return "Ce numéro ne semble pas être un vrai numéro. Merci de vérifier.";
    return null;
  }

  function checkEmail(v) {
    var raw = String(v || "").trim().toLowerCase();
    if (!raw) return "Merci d'indiquer votre adresse e-mail.";
    if (!RE_EMAIL.test(raw)) return "Adresse e-mail invalide — exemple : vous@exemple.fr.";
    var domain = raw.split("@")[1] || "";
    if (DISPOSABLE.indexOf(domain) !== -1) return "Les adresses e-mail temporaires ne sont pas acceptées.";
    if (/\.\.|@\./.test(raw)) return "Adresse e-mail invalide — vérifiez les points.";
    return null;
  }

  function checkName(v, label) {
    var raw = String(v || "").trim();
    if (raw.length < 2) return "Merci d'indiquer votre " + label + ".";
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(raw)) return "Votre " + label + " semble invalide.";
    if (/https?:|www\.|<|>/i.test(raw)) return "Votre " + label + " semble invalide.";
    return null;
  }

  /* ---------- Affichage des erreurs par champ ---------- */
  function setFieldError(input, message) {
    var field = input.closest(".field");
    if (!field) return;
    var msg = field.querySelector(".field-msg");
    if (message) {
      field.classList.add("invalid");
      field.classList.remove("valid");
      input.setAttribute("aria-invalid", "true");
      if (!msg) {
        msg = document.createElement("small");
        msg.className = "field-msg";
        field.appendChild(msg);
      }
      msg.textContent = message;
    } else {
      field.classList.remove("invalid");
      field.classList.add("valid");
      input.removeAttribute("aria-invalid");
      if (msg) msg.remove();
    }
  }

  function validatorFor(input) {
    switch (input.name) {
      case "nom": return function (v) { return checkName(v, "nom"); };
      case "prenom": return function (v) { return checkName(v, "prénom"); };
      case "telephone": return checkTel;
      case "email": return checkEmail;
      default: return null;
    }
  }

  /* ---------- Capture UTM + gclid (persistant sur la session) ---------- */
  var TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
  try {
    var params = new URLSearchParams(window.location.search);
    TRACK_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) sessionStorage.setItem("ase_" + k, v);
    });
  } catch (e) { /* stockage indisponible : on continue sans tracking */ }

  function getTracking() {
    var out = {};
    TRACK_KEYS.forEach(function (k) {
      try {
        var v = sessionStorage.getItem("ase_" + k);
        if (v) out[k] = v;
      } catch (e) { /* ignore */ }
    });
    return out;
  }

  /* ==========================================================================
     QUALIFICATION DU LEAD
     Trois questions à puces (budget, délai, occupant) injectées dans chaque
     formulaire devis + jauge de précision visible par le visiteur. Un score
     interne 0-100 est calculé à l'envoi et stocké dans Supabase (colonnes
     budget/occupant/score/qualite — migration outils/migration-002-qualification.sql).
     Tant que la migration n'est pas passée, l'envoi bascule automatiquement
     sur l'ancien format (qualification repliée dans le message) : rien ne casse.
     ========================================================================== */

  var BUDGET_PTS = {
    "Moins de 3 000 €": 10,
    "3 000 – 6 000 €": 18,
    "6 000 – 10 000 €": 22,
    "Plus de 10 000 €": 25,
    "Je ne sais pas encore": 6
  };
  var DELAI_PTS = {
    "Dès que possible": 25,
    "Dans les 3 mois": 20,
    "Dans les 6 mois": 12,
    "Je me renseigne": 5
  };
  var OCCUPANT_PTS = {
    "Propriétaire": 20,
    "Locataire": 4,
    "Pour un proche": 12
  };
  var PROJET_PTS = {
    "salle-de-bain-complete": 8,
    "douche-italienne": 8,
    "senior-pmr": 8,
    "wc-sanitaires": 5,
    "depannage-urgent": 4,
    "autre": 3
  };

  function leadScore(lead) {
    var s = 0;
    s += BUDGET_PTS[lead.budget] || 0;
    s += DELAI_PTS[lead.delai] || 0;
    s += OCCUPANT_PTS[lead.occupant] || 0;
    var cp = String(lead.code_postal || "").trim();
    if (/^93\d{3}$/.test(cp)) s += 12;
    else if (/^(75|92|94)\d{3}$/.test(cp)) s += 10;
    else if (/^(77|78|91|95)\d{3}$/.test(cp)) s += 7;
    else if (cp) s += 2;
    s += PROJET_PTS[lead.type_projet] || 0;
    var msg = String(lead.message || "").trim();
    if (msg.length >= 80) s += 10;
    else if (msg.length >= 25) s += 6;
    return Math.max(0, Math.min(100, s));
  }

  function qualiteLabel(score) {
    if (score >= 70) return "chaud";
    if (score >= 45) return "tiede";
    return "froid";
  }

  function chipGroup(name, label, hint, options) {
    var html = '<span class="chips-label">' + label +
      (hint ? ' <span class="opt">' + hint + "</span>" : "") + "</span>" +
      '<div class="chips" role="radiogroup" aria-label="' + label + '">';
    options.forEach(function (opt) {
      html += '<label class="chip"><input type="radio" name="' + name + '" value="' + opt + '"><span>' + opt + "</span></label>";
    });
    html += "</div>";
    var field = document.createElement("div");
    field.className = "field chips-field";
    field.innerHTML = html;
    return field;
  }

  function updateGauge(form) {
    var gauge = form.querySelector(".lead-gauge");
    if (!gauge) return;
    var fd = new FormData(form);
    var checks = [
      ["prenom", function (v) { return !checkName(v, "prénom"); }],
      ["nom", function (v) { return !checkName(v, "nom"); }],
      ["telephone", function (v) { return !checkTel(v); }],
      ["email", function (v) { return !checkEmail(v); }],
      ["code_postal", function (v) { return /^\d{5}$/.test(String(v || "").trim()); }],
      ["type_projet", function (v) { return !!v; }],
      ["budget", function (v) { return !!v; }],
      ["delai", function (v) { return !!v; }],
      ["occupant", function (v) { return !!v; }],
      ["message", function (v) { return String(v || "").trim().length >= 15; }]
    ];
    var total = 0;
    var done = 0;
    checks.forEach(function (c) {
      if (!form.querySelector('[name="' + c[0] + '"]')) return;
      total++;
      if (c[1](fd.get(c[0]))) done++;
    });
    var pct = total ? Math.round((done / total) * 100) : 0;
    var fill = gauge.querySelector("[data-gauge-fill]");
    var label = gauge.querySelector("[data-gauge-label]");
    if (fill) fill.style.width = Math.max(6, pct) + "%";
    gauge.classList.remove("low", "mid", "high");
    if (pct >= 80) {
      gauge.classList.add("high");
      if (label) label.textContent = "Excellente ✓";
    } else if (pct >= 45) {
      gauge.classList.add("mid");
      if (label) label.textContent = "Bonne — encore un détail";
    } else {
      gauge.classList.add("low");
      if (label) label.textContent = "À compléter";
    }
  }

  /* Injection des puces + jauge dans chaque formulaire devis. */
  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    /* L'ancien select "Vos délais" (contact.html) est remplacé par les puces. */
    var oldDelai = form.querySelector('select[name="delai"]');
    if (oldDelai) {
      var oldField = oldDelai.closest(".field");
      if (oldField) {
        var row = oldField.closest(".form-row");
        oldField.remove();
        if (row && row.children.length === 1) row.style.gridTemplateColumns = "1fr";
      }
    }

    var qualif = document.createElement("div");
    qualif.className = "lead-qualif";
    if (!form.querySelector('input[name="budget"]')) {
      qualif.appendChild(chipGroup("budget", "Votre budget envisagé", "(pour un chiffrage plus juste)", Object.keys(BUDGET_PTS)));
    }
    if (!form.querySelector('[name="delai"]')) {
      qualif.appendChild(chipGroup("delai", "Début des travaux souhaité", "", Object.keys(DELAI_PTS)));
    }
    if (!form.querySelector('input[name="occupant"]')) {
      qualif.appendChild(chipGroup("occupant", "Vous êtes", "", ["Propriétaire", "Locataire", "Pour un proche"]));
    }
    if (qualif.children.length) {
      var msgField = form.querySelector('textarea[name="message"]');
      var anchor = (msgField && msgField.closest(".field")) || form.querySelector(".consent") || form.querySelector(".form-msg");
      if (anchor) form.insertBefore(qualif, anchor);
      else form.appendChild(qualif);
    }

    var gauge = document.createElement("div");
    gauge.className = "lead-gauge low";
    gauge.innerHTML =
      '<div class="gauge-top"><span>Précision de votre demande</span><strong data-gauge-label>À compléter</strong></div>' +
      '<div class="gauge-bar" aria-hidden="true"><i data-gauge-fill></i></div>' +
      '<p class="gauge-hint">Plus votre demande est précise, plus votre estimation est rapide et fiable.</p>';
    var msgEl = form.querySelector(".form-msg");
    if (msgEl) form.insertBefore(gauge, msgEl);
    else form.appendChild(gauge);

    var refresh = function () { updateGauge(form); };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    refresh();
  });

  /* ---------- Envoi Supabase + repli si migration pas encore passée ---------- */
  function postLead(lead) {
    return fetch(SUPABASE_URL + "/rest/v1/leads", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(lead)
    });
  }

  function stripQualif(lead) {
    var copy = {};
    Object.keys(lead).forEach(function (k) {
      if (["budget", "occupant", "score", "qualite"].indexOf(k) === -1) copy[k] = lead[k];
    });
    var extras = [];
    if (lead.budget) extras.push("Budget : " + lead.budget);
    if (lead.occupant) extras.push("Occupant : " + lead.occupant);
    if (lead.score != null) extras.push("Score : " + lead.score + "/100 (" + lead.qualite + ")");
    if (extras.length) copy.message = extras.join(" · ") + (copy.message ? "\n" + copy.message : "");
    return copy;
  }

  function sendLead(lead) {
    return postLead(lead).then(function (res) {
      if (res.ok) return true;
      /* Colonnes budget/occupant/score/qualite absentes (migration 002 pas
         encore passée) : on replie la qualification dans le message. */
      return postLead(stripQualif(lead)).then(function (res2) {
        if (!res2.ok) throw new Error("HTTP " + res2.status);
        return true;
      });
    });
  }

  /* ==========================================================================
     Formulaire catalogue → Supabase + téléchargement du PDF
     Même garde anti-bot et mêmes vérificateurs que le formulaire devis.
     Le lead part avec type_projet "catalogue-douches" : le script Google Sheet
     lui envoie le catalogue par e-mail. Le PDF se télécharge aussi tout de suite.
     ========================================================================== */
  var CATALOGUE_PDF = "catalogue-douches.pdf";
  var CATALOGUE_FICHIER = "Allo Sanitaire Express 93 — Catalogue Douches.pdf";

  document.querySelectorAll("form[data-catalogue-form]").forEach(function (form) {
    form.addEventListener("focusout", function (ev) {
      var input = ev.target;
      if (!input || !input.name || !String(input.value || "").trim()) return;
      var validator = validatorFor(input);
      if (validator) setFieldError(input, validator(input.value));
    });
    form.addEventListener("input", function (ev) {
      var input = ev.target;
      if (!input || !input.name) return;
      var validator = validatorFor(input);
      if (!validator) return;
      var field = input.closest(".field");
      if (field && (field.classList.contains("invalid") || field.classList.contains("valid"))) {
        setFieldError(input, validator(input.value));
      }
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var msg = form.querySelector(".form-msg");
      var btn = form.querySelector('button[type="submit"]');
      var fd = new FormData(form);

      function fakeSuccess() {
        if (msg) { msg.className = "form-msg success"; msg.textContent = "C'est envoyé ! Surveillez votre boîte mail."; }
        if (btn) btn.disabled = true;
      }

      /* --- Garde anti-bot --- */
      if (isBanned()) { fakeSuccess(); return; }
      if (fd.get("site_web")) { banBot("honeypot"); fakeSuccess(); return; }
      var hard = hardBotSignal();
      if (hard) { banBot(hard); fakeSuccess(); return; }
      if (Date.now() - pageLoadedAt < MIN_FILL_MS) { banBot("too-fast"); fakeSuccess(); return; }
      if (interactions < MIN_INTERACTIONS) { banBot("no-interaction"); fakeSuccess(); return; }
      if (submitCount() >= MAX_SUBMITS) { banBot("burst"); fakeSuccess(); return; }

      /* --- Validation --- */
      var errors = 0;
      var firstInvalid = null;
      ["prenom", "telephone", "email"].forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) return;
        var validator = validatorFor(input);
        var error = validator ? validator(input.value) : null;
        setFieldError(input, error);
        if (error) { errors++; if (!firstInvalid) firstInvalid = input; }
      });
      if (errors) {
        if (msg) { msg.className = "form-msg error"; msg.textContent = "Merci de corriger les champs signalés en rouge."; }
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var lead = {
        nom: (fd.get("prenom") || "").toString().trim(),
        telephone: (fd.get("telephone") || "").toString().trim(),
        email: (fd.get("email") || "").toString().trim().toLowerCase(),
        type_projet: "catalogue-douches",
        message: "Demande du catalogue douches (PDF)",
        page: window.location.pathname + window.location.search,
        user_agent: navigator.userAgent,
        /* Lead magnet : intention moyenne par nature, score forfaitaire. */
        score: 45,
        qualite: "tiede"
      };
      var tracking = getTracking();
      Object.keys(tracking).forEach(function (k) { lead[k] = tracking[k]; });

      if (msg) { msg.className = "form-msg sending"; msg.textContent = "Préparation de votre catalogue…"; }
      if (btn) btn.disabled = true;
      bumpSubmitCount();

      sendLead(lead).then(function () {
        try {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "catalogue_lead" });
        } catch (e) { /* ignore */ }
        /* Téléchargement immédiat + bascule de la carte en mode succès */
        var a = document.createElement("a");
        a.href = CATALOGUE_PDF;
        a.download = CATALOGUE_FICHIER;
        document.body.appendChild(a);
        a.click();
        a.remove();
        var card = form.closest("[data-catalogue-card]");
        if (card) card.classList.add("done");
        if (msg) {
          msg.className = "form-msg success";
          msg.innerHTML = "Votre catalogue se télécharge ! Il arrive aussi par e-mail dans quelques minutes (pensez au dossier spam la première fois). <a href=\"" + CATALOGUE_PDF + "\" download=\"" + CATALOGUE_FICHIER + "\"><strong>Re-télécharger le PDF</strong></a>";
        }
      }).catch(function () {
        if (btn) btn.disabled = false;
        if (msg) {
          msg.className = "form-msg error";
          msg.innerHTML = "Une erreur est survenue. Réessayez ou appelez-nous au <a href=\"tel:0766325713\"><strong>07 66 32 57 13</strong></a>.";
        }
      });
    });
  });

  /* ==========================================================================
     Formulaire lead → Supabase
     ========================================================================== */
  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {

    /* Validation en direct : l'erreur disparaît dès que le champ est corrigé. */
    form.addEventListener("input", function (ev) {
      var input = ev.target;
      if (!input || !input.name) return;
      var validator = validatorFor(input);
      if (!validator) return;
      var field = input.closest(".field");
      if (field && (field.classList.contains("invalid") || field.classList.contains("valid"))) {
        setFieldError(input, validator(input.value));
      }
    });
    form.addEventListener("focusout", function (ev) {
      var input = ev.target;
      if (!input || !input.name || !String(input.value || "").trim()) return;
      var validator = validatorFor(input);
      if (validator) setFieldError(input, validator(input.value));
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var msg = form.querySelector(".form-msg");
      var btn = form.querySelector('button[type="submit"]');
      var fd = new FormData(form);

      function fakeSuccess() {
        /* Faux succès pour les bots : pas d'envoi, pas de redirection merci.html,
           donc pas de conversion Google Ads comptée. */
        if (msg) { msg.className = "form-msg success"; msg.textContent = "Demande reçue ! Nous revenons vers vous très vite."; }
        if (btn) btn.disabled = true;
      }

      /* --- Garde anti-bot au moment de l'envoi --- */
      if (isBanned()) { fakeSuccess(); return; }
      if (fd.get("site_web")) { banBot("honeypot"); fakeSuccess(); return; }
      var hard = hardBotSignal();
      if (hard) { banBot(hard); fakeSuccess(); return; }
      if (Date.now() - pageLoadedAt < MIN_FILL_MS) { banBot("too-fast"); fakeSuccess(); return; }
      if (interactions < MIN_INTERACTIONS) { banBot("no-interaction"); fakeSuccess(); return; }
      if (submitCount() >= MAX_SUBMITS) { banBot("burst"); fakeSuccess(); return; }

      /* --- Validation stricte des champs --- */
      var errors = 0;
      var firstInvalid = null;
      ["prenom", "nom", "telephone", "email"].forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) return;
        var validator = validatorFor(input);
        var error = validator ? validator(input.value) : null;
        setFieldError(input, error);
        if (error) {
          errors++;
          if (!firstInvalid) firstInvalid = input;
        }
      });

      if (errors) {
        if (msg) { msg.className = "form-msg error"; msg.textContent = "Merci de corriger les champs signalés en rouge."; }
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var lead = {
        nom: ((fd.get("prenom") || "").toString().trim() + " " + (fd.get("nom") || "").toString().trim()).trim(),
        telephone: (fd.get("telephone") || "").toString().trim(),
        email: (fd.get("email") || "").toString().trim().toLowerCase() || null,
        code_postal: (fd.get("code_postal") || "").toString().trim() || null,
        ville: (fd.get("ville") || "").toString().trim() || null,
        type_projet: (fd.get("type_projet") || "").toString() || null,
        delai: (fd.get("delai") || "").toString() || null,
        budget: (fd.get("budget") || "").toString() || null,
        occupant: (fd.get("occupant") || "").toString() || null,
        message: (fd.get("message") || "").toString().trim() || null,
        page: window.location.pathname + window.location.search,
        user_agent: navigator.userAgent
      };
      lead.score = leadScore(lead);
      lead.qualite = qualiteLabel(lead.score);

      var tracking = getTracking();
      Object.keys(tracking).forEach(function (k) { lead[k] = tracking[k]; });

      if (msg) { msg.className = "form-msg sending"; msg.textContent = "Envoi sécurisé de votre demande…"; }
      if (btn) { btn.disabled = true; }
      bumpSubmitCount();

      sendLead(lead).then(function () {
        /* Score poussé dans GTM : utilisable comme valeur de conversion Ads. */
        try {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "lead_submit", lead_score: lead.score, lead_qualite: lead.qualite });
        } catch (e) { /* ignore */ }
        window.location.href = "merci.html";
      }).catch(function () {
        if (btn) { btn.disabled = false; }
        if (msg) {
          msg.className = "form-msg error";
          msg.innerHTML = "Une erreur est survenue. Réessayez ou appelez-nous directement au <a href=\"tel:0766325713\"><strong>07 66 32 57 13</strong></a>.";
        }
      });
    });
  });
})();
