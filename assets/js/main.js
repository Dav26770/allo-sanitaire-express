/* ==========================================================================
   Allo Sanitaire Express 93 — main.js
   Menu mobile · scroll-reveal · capture UTM/gclid · formulaire lead → Supabase
   ========================================================================== */
(function () {
  "use strict";

  var SUPABASE_URL = "https://xmkvaetrejjqymahbgvi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_tgF6sFFuzb5u0WhZSybqBg_X_79Xaeb";

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

  /* ---------- Formulaire lead → Supabase ---------- */
  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var msg = form.querySelector(".form-msg");
      var btn = form.querySelector('button[type="submit"]');
      var fd = new FormData(form);

      /* Honeypot anti-spam */
      if (fd.get("site_web")) return;

      var lead = {
        nom: (fd.get("nom") || "").toString().trim(),
        telephone: (fd.get("telephone") || "").toString().trim(),
        email: (fd.get("email") || "").toString().trim() || null,
        code_postal: (fd.get("code_postal") || "").toString().trim() || null,
        ville: (fd.get("ville") || "").toString().trim() || null,
        type_projet: (fd.get("type_projet") || "").toString() || null,
        delai: (fd.get("delai") || "").toString() || null,
        message: (fd.get("message") || "").toString().trim() || null,
        page: window.location.pathname + window.location.search,
        user_agent: navigator.userAgent
      };

      var tracking = getTracking();
      Object.keys(tracking).forEach(function (k) { lead[k] = tracking[k]; });

      if (!lead.nom || !lead.telephone) {
        if (msg) { msg.className = "form-msg error"; msg.textContent = "Merci d'indiquer votre nom et votre téléphone."; }
        return;
      }
      if (!/^(\+33|0)[1-9]([ .-]?[0-9]{2}){4}$/.test(lead.telephone.replace(/\s/g, " "))) {
        if (msg) { msg.className = "form-msg error"; msg.textContent = "Le numéro de téléphone semble invalide (ex. 06 12 34 56 78)."; }
        return;
      }

      if (msg) { msg.className = "form-msg sending"; msg.textContent = "Envoi de votre demande…"; }
      if (btn) { btn.disabled = true; }

      fetch(SUPABASE_URL + "/rest/v1/leads", {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(lead)
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
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
