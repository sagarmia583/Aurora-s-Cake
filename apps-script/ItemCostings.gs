/**
 * AURORA'S CAKE — Item Costing & Profit Margin Sheet Integration
 *
 * Persists and synchronizes cake recipe costs, ingredients, packaging,
 * delivery overheads, net profit, and profit margin directly to the
 * 'item_costings' Google Sheets tab.
 */

var AURORA_COSTING_COLUMNS_ = [
  'product_id',
  'product_name',
  'category_name',
  'selling_price',
  'cost_ingredients',
  'cost_packaging',
  'cost_delivery',
  'cost_other',
  'total_cost',
  'net_profit',
  'profit_margin',
  'updated_at'
];

function auroraCostingSheet_(book) {
  var sheet = book.getSheetByName('item_costings');
  if (!sheet) {
    sheet = book.insertSheet('item_costings');
    sheet.getRange(1, 1, 1, AURORA_COSTING_COLUMNS_.length).setValues([AURORA_COSTING_COLUMNS_]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, AURORA_COSTING_COLUMNS_.length)
      .setBackground('#174B3B')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setColumnWidths(1, AURORA_COSTING_COLUMNS_.length, 140);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, AURORA_COSTING_COLUMNS_.length).setValues([AURORA_COSTING_COLUMNS_]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, AURORA_COSTING_COLUMNS_.length)
      .setBackground('#174B3B')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }
  return sheet;
}

function auroraCostingPost_(input) {
  if (!input || typeof input !== 'object') {
    auroraReject_('invalid_request', 'Invalid costing request payload.');
  }
  // Native staff workspace uses one authenticated route for reading and saving.
  if(input.action==='staff_item_costings'){
    var actor=auroraStaffAuthenticate_(input);
    if(['super_admin','admin','order_manager','accountant'].indexOf(actor.role)===-1)
      auroraReject_('forbidden','This staff role cannot manage item costings.');
    if(['read','save'].indexOf(input.operation)===-1)auroraReject_('invalid_action','Choose read or save costings.');
    if(input.operation==='save'){
      if(!Array.isArray(input.costings)||!input.costings.length||input.costings.length>500)auroraReject_('invalid_request','Provide 1–500 item costings.');
      var products=auroraRows_(auroraSpreadsheet_(),'products').map(function(row){return String(row.id);});
      input.costings.forEach(function(item){
        if(!item||products.indexOf(String(item.product_id))===-1)auroraReject_('invalid_reference','Choose an existing cake.');
        ['selling_price','cost_ingredients','cost_packaging','cost_delivery','cost_other'].forEach(function(field){
          if(typeof item[field]!=='number'||!isFinite(item[field])||item[field]<0||item[field]>10000000)auroraReject_('invalid_value','Costing amounts must be non-negative numbers.');
        });
      });
    }
    var mapped={};Object.keys(input).forEach(function(key){mapped[key]=input[key];});
    mapped.action=input.operation==='read'?'get_item_costings':'sync_item_costings';
    return auroraCostingPost_(mapped);
  }

  // Action 1: Read costings from Google Sheet
  if (input.action === 'get_item_costings') {
    var book = auroraSpreadsheet_();
    var sheet = book.getSheetByName('item_costings');
    if (!sheet || sheet.getLastRow() < 2) {
      return { ok: true, success: true, costings: [] };
    }
    var numRows = sheet.getLastRow() - 1;
    var numCols = AURORA_COSTING_COLUMNS_.length;
    var values = sheet.getRange(2, 1, numRows, numCols).getValues();

    var costings = values.filter(function(row) {
      return row[0] && String(row[0]).trim();
    }).map(function(row) {
      return {
        product_id: String(row[0]).trim(),
        product_name: String(row[1] || ''),
        category_name: String(row[2] || ''),
        selling_price: Number(row[3] || 0),
        cost_ingredients: Number(row[4] || 0),
        cost_packaging: Number(row[5] || 0),
        cost_delivery: Number(row[6] || 0),
        cost_other: Number(row[7] || 0),
        total_cost: Number(row[8] || 0),
        net_profit: Number(row[9] || 0),
        profit_margin: Number(row[10] || 0),
        updated_at: String(row[11] || '')
      };
    });

    return { ok: true, success: true, costings: costings };
  }

  // Action 2: Save / Sync costings to Google Sheet
  if (input.action === 'sync_item_costings') {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      auroraReject_('busy', 'Costing synchronization is in progress. Please retry.');
    }
    try {
      var book = auroraSpreadsheet_();
      var sheet = auroraCostingSheet_(book);

      var list = Array.isArray(input.costings) ? input.costings : (input.costing ? [input.costing] : []);
      if (!list.length) {
        return { ok: true, success: true, count: 0, message: 'No costing items to update.' };
      }

      var lastRow = sheet.getLastRow();
      var existingMap = {}; // product_id -> row number (1-based)
      if (lastRow > 1) {
        var existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        existingIds.forEach(function(row, idx) {
          var id = String(row[0]).trim();
          if (id) existingMap[id] = idx + 2;
        });
      }

      var updatedCount = 0;
      var newRows = [];

      list.forEach(function(item) {
        if (!item || typeof item !== 'object') return;
        var pid = String(item.product_id || '').trim();
        if (!pid) return;

        var selling = typeof item.selling_price === 'number' && Number.isFinite(item.selling_price) ? Math.round(item.selling_price * 100) / 100 : Number(item.selling_price) || 0;
        var ing = typeof item.cost_ingredients === 'number' && Number.isFinite(item.cost_ingredients) ? Math.round(item.cost_ingredients * 100) / 100 : Number(item.cost_ingredients) || 0;
        var pkg = typeof item.cost_packaging === 'number' && Number.isFinite(item.cost_packaging) ? Math.round(item.cost_packaging * 100) / 100 : Number(item.cost_packaging) || 0;
        var del = typeof item.cost_delivery === 'number' && Number.isFinite(item.cost_delivery) ? Math.round(item.cost_delivery * 100) / 100 : Number(item.cost_delivery) || 0;
        var oth = typeof item.cost_other === 'number' && Number.isFinite(item.cost_other) ? Math.round(item.cost_other * 100) / 100 : Number(item.cost_other) || 0;

        var totalCost = Math.round((ing + pkg + del + oth) * 100) / 100;
        var netProfit = Math.round((selling - totalCost) * 100) / 100;
        var profitMargin = selling > 0 ? Math.round(((netProfit / selling) * 100) * 10) / 10 : 0;
        var updatedAt = item.updated_at ? String(item.updated_at) : new Date().toISOString();

        var rowValues = [
          auroraSheetCell_(pid),
          auroraSheetCell_(String(item.product_name || '')),
          auroraSheetCell_(String(item.category_name || '')),
          selling,
          ing,
          pkg,
          del,
          oth,
          totalCost,
          netProfit,
          profitMargin,
          auroraSheetCell_(updatedAt)
        ];

        if (existingMap[pid]) {
          sheet.getRange(existingMap[pid], 1, 1, AURORA_COSTING_COLUMNS_.length).setValues([rowValues]);
          updatedCount++;
        } else {
          newRows.push(rowValues);
          existingMap[pid] = lastRow + newRows.length;
          updatedCount++;
        }
      });

      if (newRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, AURORA_COSTING_COLUMNS_.length).setValues(newRows);
      }

      return {
        ok: true,
        success: true,
        count: updatedCount,
        message: 'Item costings and profit margins successfully synchronized to Google Sheet!'
      };
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }
  }

  auroraReject_('invalid_action', 'Unknown costing action.');
}
