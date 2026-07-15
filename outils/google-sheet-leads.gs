/**
 * Allo Sanitaire Express 93 — Synchro des leads Supabase → Google Sheet
 *
 * INSTALLATION (5 minutes) :
 * 1. Ouvre ton Google Sheet → menu Extensions → Apps Script
 * 2. Colle tout ce fichier à la place du contenu par défaut
 * 3. À gauche : Paramètres du projet (roue dentée) → Propriétés du script → ajoute :
 *      SUPABASE_URL        = https://xmkvaetrejjqymahbgvi.supabase.co
 *      SUPABASE_SECRET_KEY = (clé "secret" : Supabase → Settings → API Keys → sb_secret_…)
 * 4. Dans l'éditeur, choisis la fonction "installation" puis clique Exécuter
 *    (autorise le script quand Google le demande)
 * 5. C'est tout : les nouveaux leads arrivent dans l'onglet "Leads" toutes les 5 minutes.
 */

var FEUILLE = 'Leads';
var COLONNES = ['id', 'created_at', 'nom', 'telephone', 'email', 'code_postal', 'ville',
  'type_projet', 'delai', 'message', 'page', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_term', 'utm_content', 'gclid', 'statut'];

function installation() {
  var sheet = feuille_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLONNES);
    sheet.getRange(1, 1, 1, COLONNES.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  // Supprime les anciens déclencheurs puis en crée un toutes les 5 minutes
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('synchroniserLeads').timeBased().everyMinutes(5).create();
  synchroniserLeads();
}

function synchroniserLeads() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SECRET_KEY');
  if (!url || !key) throw new Error('Renseigne SUPABASE_URL et SUPABASE_SECRET_KEY dans les propriétés du script.');

  var sheet = feuille_();

  // IDs déjà présents dans la feuille (colonne A)
  var existants = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (r[0]) existants[r[0]] = true;
    });
  }

  var reponse = UrlFetchApp.fetch(
    url + '/rest/v1/leads?select=*&order=created_at.asc&limit=1000',
    { headers: { apikey: key, Authorization: 'Bearer ' + key } }
  );
  var leads = JSON.parse(reponse.getContentText());

  var nouvelles = [];
  leads.forEach(function (lead) {
    if (existants[lead.id]) return;
    nouvelles.push(COLONNES.map(function (c) {
      if (c === 'created_at' && lead[c]) {
        return Utilities.formatDate(new Date(lead[c]), 'Europe/Paris', 'dd/MM/yyyy HH:mm');
      }
      return lead[c] == null ? '' : String(lead[c]);
    }));
  });

  if (nouvelles.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, nouvelles.length, COLONNES.length).setValues(nouvelles);
  }
}

function feuille_() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  return doc.getSheetByName(FEUILLE) || doc.insertSheet(FEUILLE);
}
