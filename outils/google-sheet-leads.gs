/**
 * Allo Sanitaire Express 93 — Leads Supabase → Google Sheet
 * Installé automatiquement. Ne rien modifier ici.
 * Les nouveaux leads arrivent toutes les 5 minutes dans l'onglet "Leads",
 * les statistiques se mettent à jour dans l'onglet "Stats",
 * et un email est envoyé à chaque nouveau lead.
 */

var SUPABASE_URL = 'https://xmkvaetrejjqymahbgvi.supabase.co';
var CLE_PUBLIQUE = 'sb_publishable_tgF6sFFuzb5u0WhZSybqBg_X_79Xaeb';
var CODE_EXPORT = 'REMPLACE_PAR_TON_CODE_EXPORT';

var SHEET_ID = '1rqHyq35W3h4H0UO1ktRGi-Piw3RLVOFIRjY199Rxe2c';
var FEUILLE = 'Leads';
var CHAMPS = ['id', 'created_at', 'nom', 'telephone', 'email', 'code_postal', 'ville',
  'type_projet', 'delai', 'message', 'page', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_term', 'utm_content', 'gclid', 'statut'];
var ENTETES = ['ID', 'Date', 'Nom', 'Téléphone', 'Email', 'Code postal', 'Ville',
  'Projet', 'Délai', 'Message', 'Page', 'Source', 'Medium', 'Campagne',
  'Terme', 'Contenu', 'GCLID', 'Statut'];
var STATUTS = ['Nouveau', 'Appelé', 'RDV pris', 'Devis envoyé', 'Gagné', 'Perdu'];
var MARINE = '#0E2B49';
var ORANGE = '#F58220';

function installation() {
  var sheet = feuille_();

  // En-têtes aux couleurs de la marque
  sheet.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES])
    .setBackground(MARINE).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  // Largeurs de colonnes
  var largeurs = [90, 130, 150, 120, 190, 90, 130, 170, 120, 280, 150, 110, 100, 130, 100, 100, 110, 120];
  largeurs.forEach(function (l, i) { sheet.setColumnWidth(i + 1, l); });

  // Téléphone en texte (garde le 0), date au bon format
  sheet.getRange('D2:D').setNumberFormat('@');
  sheet.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm');

  // Menu déroulant Statut
  var regleStatut = SpreadsheetApp.newDataValidation().requireValueInList(STATUTS, true).setAllowInvalid(true).build();
  sheet.getRange('R2:R').setDataValidation(regleStatut);

  // Couleurs par statut
  var plageStatut = sheet.getRange('R2:R');
  var couleurs = { 'Nouveau': '#FDEBD0', 'Appelé': '#FCF3CF', 'RDV pris': '#D6EAF8', 'Devis envoyé': '#E8DAEF', 'Gagné': '#D5F5E3', 'Perdu': '#EAECEE' };
  var regles = Object.keys(couleurs).map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s).setBackground(couleurs[s]).setRanges([plageStatut]).build();
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
  var sheet = feuille_();
  var premiereFois = sheet.getLastRow() <= 1;

  var existants = {};
  if (!premiereFois) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (r[0]) existants[String(r[0])] = true;
    });
  }

  var reponse = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/export_leads', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ cle: CODE_EXPORT }),
    headers: { apikey: CLE_PUBLIQUE, Authorization: 'Bearer ' + CLE_PUBLIQUE }
  });
  var leads = JSON.parse(reponse.getContentText());

  var nouvelles = [];
  var resume = [];
  leads.forEach(function (lead) {
    if (existants[String(lead.id)]) return;
    nouvelles.push(CHAMPS.map(function (c) {
      if (c === 'created_at' && lead[c]) return new Date(lead[c]);
      if (c === 'statut') return lead[c] === 'nouveau' ? 'Nouveau' : (lead[c] || 'Nouveau');
      return lead[c] == null ? '' : String(lead[c]);
    }));
    resume.push('• ' + (lead.nom || '?') + ' — ' + (lead.telephone || '') +
      (lead.type_projet ? ' — ' + lead.type_projet : '') + (lead.ville ? ' — ' + lead.ville : ''));
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
    }
  }
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
    ['Gagnés', '=COUNTIF(Leads!R2:R,"Gagné")'],
    ['Taux de conversion', '=IFERROR(COUNTIF(Leads!R2:R,"Gagné")/COUNTA(Leads!A2:A),0)']
  ];
  lignes.forEach(function (l, i) {
    stats.getRange(3 + i, 1).setValue(l[0]).setFontWeight('bold');
    stats.getRange(3 + i, 2).setFormula(l[1]);
  });
  stats.getRange('B8').setNumberFormat('0.0%');

  stats.getRange('A11').setValue('Par type de projet').setFontWeight('bold').setFontColor(ORANGE);
  stats.getRange('A12').setFormula('=IFERROR(QUERY(Leads!A2:R,"select H, count(A) where H is not null group by H order by count(A) desc label H \'\', count(A) \'\'",0),"—")');

  stats.getRange('D11').setValue('Par source de trafic').setFontWeight('bold').setFontColor(ORANGE);
  stats.getRange('D12').setFormula('=IFERROR(QUERY(Leads!A2:R,"select L, count(A) where L is not null group by L order by count(A) desc label L \'\', count(A) \'\'",0),"—")');

  stats.setColumnWidth(1, 190);
  stats.setColumnWidth(4, 190);
}

function feuille_() {
  var doc = SpreadsheetApp.openById(SHEET_ID);
  return doc.getSheetByName(FEUILLE) || doc.insertSheet(FEUILLE, 0);
}
