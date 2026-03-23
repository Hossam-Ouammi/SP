const fs = require('fs');
const path = require('path');

let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Inject app-view start
const appViewStart = '<section id="app-view" class="page app-page hidden">';
html = html.replace(appViewStart, '<% if (typeof user !== "undefined" && user) { %>\n      ' + appViewStart);

// Close app-view
const appViewEnd = '</section>\r\n    </main>';
if (html.includes(appViewEnd)) {
  html = html.replace(appViewEnd, '</section>\r\n    <% } %>\r\n    </main>');
} else {
  const appViewEndUnix = '</section>\n    </main>';
  html = html.replace(appViewEndUnix, '</section>\n    <% } %>\n    </main>');
}

// Inject admin tools start
const adminToolsStart = '<section id="admin-tools-panel" class="user-admin-shell hidden">';
html = html.replace(adminToolsStart, '<% if (typeof user !== "undefined" && user.est_admin === 1) { %>\n              ' + adminToolsStart);

// Inject admin tools end using regex securely
html = html.replace(/(<section id="admin-tools-panel"[\s\S]*?<\/section>)/, '$1\n              <% } %>');

if (!fs.existsSync(path.join(__dirname, 'views'))) {
  fs.mkdirSync(path.join(__dirname, 'views'));
}
fs.writeFileSync(path.join(__dirname, 'views', 'index.ejs'), html);
console.log('views/index.ejs re-created successfully.');

fs.unlinkSync(path.join(__dirname, 'public', 'index.html'));
console.log('public/index.html removed safely.');
