/**
 * Allo Sanitaire Express 93 — Leads Supabase → Google Sheet
 * Version « qualification » (23 juil. 2026) — INSTALLÉE dans Apps Script.
 *
 * Fonctionnement :
 *  - synchroniserLeads() tourne toutes les 5 minutes (déclencheur posé par installation())
 *  - lit la table leads via l'API REST Supabase avec la clé secrète stockée dans
 *    les propriétés du script (SUPABASE_URL + SUPABASE_SECRET_KEY — déjà en place)
 *  - ajoute les nouveaux leads (dédoublonnés par ID) dans l'onglet "Leads"
 *  - colonnes Budget / Occupant / Score / Qualité (🔥 Chaud · 🌤 Tiède · ❄️ Froid)
 *  - envoie un e-mail de notification à chaque nouveau lead
 *  - envoie automatiquement le catalogue PDF aux leads "catalogue-douches"
 *  - onglet "Stats" : totaux, leads chauds, score moyen, répartitions
 *
 * Après modification du code : exécuter installation() une fois.
 */

var SHEET_ID = '1rqHyq35W3h4H0UO1ktRGi-Piw3RLVOFIRjY199Rxe2c';
var FEUILLE = 'Leads';
var CHAMPS = ['id', 'created_at', 'nom', 'telephone', 'email', 'code_postal', 'ville',
  'type_projet', 'delai', 'budget', 'occupant', 'score', 'qualite',
  'message', 'page', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_term', 'utm_content', 'gclid', 'statut'];
var ENTETES = ['ID', 'Date', 'Nom', 'Téléphone', 'Email', 'Code postal', 'Ville',
  'Projet', 'Délai', 'Budget', 'Occupant', 'Score', 'Qualité',
  'Message', 'Page', 'Source', 'Medium', 'Campagne',
  'Terme', 'Contenu', 'GCLID', 'Statut'];
var QUALITES = { chaud: '🔥 Chaud', tiede: '🌤 Tiède', froid: '❄️ Froid' };
var STATUTS = ['Nouveau', 'Appelé', 'RDV pris', 'Devis envoyé', 'Gagné', 'Perdu'];
var MARINE = '#0E2B49';
var ORANGE = '#F58220';

/* Catalogue PDF envoyé automatiquement aux leads "catalogue-douches" */
var SITE_URL = 'https://allo-sanitaire-express93.fr';
var CATALOGUE_URL = SITE_URL + '/catalogue-douches.pdf';
var CATALOGUE_NOM_FICHIER = 'Allo Sanitaire Express 93 — Catalogue Douches.pdf';
var TEL_AFFICHE = '07 66 32 57 13';

function installation() {
  var sheet = feuille_();

  // En-têtes aux couleurs de la marque
  sheet.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES])
    .setBackground(MARINE).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  // Largeurs de colonnes
  var largeurs = [90, 130, 150, 120, 190, 90, 130, 170, 130, 140, 110, 70, 95, 280, 150, 110, 100, 130, 100, 100, 110, 120];
  largeurs.forEach(function (l, i) { sheet.setColumnWidth(i + 1, l); });

  // Téléphone en texte (garde le 0), date au bon format, score numérique
  sheet.getRange('D2:D').setNumberFormat('@');
  sheet.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange('L2:L').setNumberFormat('0');

  // Menu déroulant Statut
  var regleStatut = SpreadsheetApp.newDataValidation().requireValueInList(STATUTS, true).setAllowInvalid(true).build();
  sheet.getRange('V2:V').setDataValidation(regleStatut);

  // Couleurs par statut
  var plageStatut = sheet.getRange('V2:V');
  var couleurs = { 'Nouveau': '#FDEBD0', 'Appelé': '#FCF3CF', 'RDV pris': '#D6EAF8', 'Devis envoyé': '#E8DAEF', 'Gagné': '#D5F5E3', 'Perdu': '#EAECEE' };
  var regles = Object.keys(couleurs).map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s).setBackground(couleurs[s]).setRanges([plageStatut]).build();
  });

  // Jauge de qualité du lead (colonne M)
  var plageQualite = sheet.getRange('M2:M');
  var couleursQualite = { 'Chaud': '#FADBC8', 'Tiède': '#FCF3CF', 'Froid': '#E4EAF1' };
  Object.keys(couleursQualite).forEach(function (q) {
    regles.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains(q).setBackground(couleursQualite[q]).setRanges([plageQualite]).build());
  });
  sheet.setConditionalFormatRules(regles);

  // Filtre sur les en-têtes
  var filtre = sheet.getFilter();
  if (filtre) filtre.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), ENTETES.length).createFilter();

  construireStats_();

  // Déclencheur toutes les 5 minutes
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('synchroniserLeads').timeBased().everyMinutes(5).create();

  synchroniserLeads();
}

function synchroniserLeads() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL') || 'https://xmkvaetrejjqymahbgvi.supabase.co';
  var key = props.getProperty('SUPABASE_SECRET_KEY');
  if (!key) throw new Error('Renseigne SUPABASE_SECRET_KEY dans les propriétés du script.');

  var sheet = feuille_();
  var premiereFois = sheet.getLastRow() <= 1;

  var existants = {};
  if (!premiereFois) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (r[0]) existants[String(r[0])] = true;
    });
  }

  var reponse = UrlFetchApp.fetch(url + '/rest/v1/leads?select=*&order=created_at.asc&limit=10000', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  var leads = JSON.parse(reponse.getContentText());

  var nouvelles = [];
  var resume = [];
  var demandesCatalogue = [];
  leads.forEach(function (lead) {
    if (existants[String(lead.id)]) return;
    nouvelles.push(CHAMPS.map(function (c) {
      if (c === 'created_at' && lead[c]) return new Date(lead[c]);
      if (c === 'statut') return lead[c] === 'nouveau' ? 'Nouveau' : (lead[c] || 'Nouveau');
      if (c === 'qualite') return QUALITES[lead[c]] || (lead[c] || '');
      if (c === 'score') return lead[c] == null ? '' : Number(lead[c]);
      return lead[c] == null ? '' : String(lead[c]);
    }));
    resume.push('• ' + (lead.nom || '?') + ' — ' + (lead.telephone || '') +
      (lead.type_projet ? ' — ' + lead.type_projet : '') + (lead.ville ? ' — ' + lead.ville : '') +
      (lead.score != null ? ' — ' + (QUALITES[lead.qualite] || '') + ' ' + lead.score + '/100' : ''));
    if (lead.type_projet === 'catalogue-douches' && lead.email) demandesCatalogue.push(lead);
  });

  if (nouvelles.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, nouvelles.length, CHAMPS.length).setValues(nouvelles);

    // Notification email (sauf lors du tout premier import)
    if (!premiereFois) {
      try {
        MailApp.sendEmail(
          Session.getActiveUser().getEmail(),
          '🆕 ' + nouvelles.length + ' nouveau(x) lead(s) — Allo Sanitaire Express 93',
          'Nouvelles demandes de devis :\n\n' + resume.join('\n') +
          '\n\nVoir le tableau : ' + SpreadsheetApp.openById(SHEET_ID).getUrl()
        );
      } catch (e) { /* quota email atteint : on continue sans bloquer */ }

      // Envoi du catalogue aux nouveaux leads "catalogue-douches"
      demandesCatalogue.forEach(function (lead) {
        try { envoyerCatalogue_(lead); } catch (e) { /* on n'interrompt pas la synchro */ }
      });
    }
  }
}

/**
 * Envoie le catalogue PDF par e-mail au lead (appelé pour chaque nouveau
 * lead "catalogue-douches" — jamais deux fois grâce au dédoublonnage par ID).
 */
function envoyerCatalogue_(lead) {
  var prenom = String(lead.nom || '').split(' ')[0] || 'Bonjour';
  var pdf = UrlFetchApp.fetch(CATALOGUE_URL).getBlob().setName(CATALOGUE_NOM_FICHIER);

  var htmlBody =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#16334F;max-width:560px;margin:0 auto">' +
    '<div style="background:' + MARINE + ';padding:22px 28px;border-radius:12px 12px 0 0">' +
    '<span style="color:#fff;font-size:18px;font-weight:bold">Allo Sanitaire Express <span style="background:' + ORANGE + ';color:#fff;border-radius:6px;padding:1px 7px;font-size:13px">93</span></span>' +
    '</div>' +
    '<div style="background:#F5F8FC;padding:28px;border-radius:0 0 12px 12px;border:1px solid #DDE6EF;border-top:none">' +
    '<p style="font-size:16px">Bonjour ' + prenom + ',</p>' +
    '<p>Voici votre <strong>Catalogue Douches 2026</strong> en pièce jointe : modèles de douches italiennes, budgets réels constatés sur nos chantiers et conseils de nos artisans.</p>' +
    '<p style="margin:24px 0"><a href="' + CATALOGUE_URL + '" style="background:' + ORANGE + ';color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px;display:inline-block">Télécharger le catalogue</a></p>' +
    '<p>Un projet de douche ou de salle de bain ? Un conseiller peut vous rappeler pour une <strong>étude gratuite</strong> et un <strong>devis ferme sous 24h</strong>.</p>' +
    '<p style="margin:20px 0 6px"><strong>📞 ' + TEL_AFFICHE + '</strong> — 7j/7<br>' +
    '<a href="' + SITE_URL + '/contact.html" style="color:#1B4F82">Demander mon devis gratuit →</a></p>' +
    '<hr style="border:none;border-top:1px solid #DDE6EF;margin:22px 0">' +
    '<p style="font-size:12px;color:#4A6076">Vous recevez cet e-mail car vous avez demandé notre catalogue sur ' +
    '<a href="' + SITE_URL + '" style="color:#1B4F82">allo-sanitaire-express93.fr</a>. ' +
    'Vos données ne sont jamais revendues.</p>' +
    '</div></div>';

  MailApp.sendEmail({
    to: String(lead.email),
    subject: 'Votre Catalogue Douches 2026 — Allo Sanitaire Express 93',
    htmlBody: htmlBody,
    body: 'Bonjour ' + prenom + ',\n\nVoici votre Catalogue Douches 2026 : ' + CATALOGUE_URL +
      '\n\nUn projet ? Étude gratuite et devis ferme sous 24h au ' + TEL_AFFICHE + '.\n\nAllo Sanitaire Express 93',
    attachments: [pdf],
    name: 'Allo Sanitaire Express 93'
  });
}

function construireStats_() {
  var doc = SpreadsheetApp.openById(SHEET_ID);
  var stats = doc.getSheetByName('Stats') || doc.insertSheet('Stats');
  stats.clear();

  stats.getRange('A1').setValue('📊 Leads — Allo Sanitaire Express 93')
    .setFontWeight('bold').setFontSize(14).setFontColor(MARINE);

  var lignes = [
    ['Total des leads', '=COUNTA(Leads!A2:A)'],
    ["Aujourd'hui", '=COUNTIFS(Leads!B2:B,">="&TODAY())'],
    ['7 derniers jours', '=COUNTIFS(Leads!B2:B,">="&TODAY()-7)'],
    ['30 derniers jours', '=COUNTIFS(Leads!B2:B,">="&TODAY()-30)'],
    ['🔥 Leads chauds', '=COUNTIF(Leads!M2:M,"*Chaud*")'],
    ['Score moyen', '=IFERROR(ROUND(AVERAGE(Leads!L2:L),0),"—")'],
    ['Gagnés', '=COUNTIF(Leads!V2:V,"Gagné")'],
    ['Taux de conversion', '=IFERROR(COUNTIF(Leads!V2:V,"Gagné")/COUNTA(Leads!A2:A),0)']
  ];
  lignes.forEach(function (l, i) {
    stats.getRange(3 + i, 1).setValue(l[0]).setFontWeight('bold');
    stats.getRange(3 + i, 2).setFormula(l[1]);
  });
  stats.getRange('B10').setNumberFormat('0.0%');

  stats.getRange('D3').setValue('Par qualité de lead').setFontWeight('bold').setFontColor(ORANGE);
  stats.getRange('D4').setFormula('=IFERROR(QUERY(Leads!A2:V,"select M, count(A) where M is not null group by M order by count(A) desc label M \'\', count(A) \'\'",0),"—")');

  stats.getRange('A13').setValue('Par type de projet').setFontWeight('bold').setFontColor(ORANGE);
  stats.getRange('A14').setFormula('=IFERROR(QUERY(Leads!A2:V,"select H, count(A) where H is not null group by H order by count(A) desc label H \'\', count(A) \'\'",0),"—")');

  stats.getRange('D13').setValue('Par source de trafic').setFontWeight('bold').setFontColor(ORANGE);
  stats.getRange('D14').setFormula('=IFERROR(QUERY(Leads!A2:V,"select P, count(A) where P is not null group by P order by count(A) desc label P \'\', count(A) \'\'",0),"—")');

  stats.setColumnWidth(1, 190);
  stats.setColumnWidth(4, 190);
}

function feuille_() {
  var doc = SpreadsheetApp.openById(SHEET_ID);
  return doc.getSheetByName(FEUILLE) || doc.insertSheet(FEUILLE, 0);
}

/**
 * Vide l'onglet Leads puis réinstalle tout : les leads se réimportent
 * depuis Supabase au format 22 colonnes. Les statuts saisis à la main
 * repassent à "Nouveau" — à utiliser seulement pour changer de format.
 */
function reinitialisation() {
  feuille_().clear();
  installation();
}
