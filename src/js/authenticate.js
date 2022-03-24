const vscode = require('vscode');
const polka = require("polka");
const TokenManager = require("./TokenManager");

module.exports = (fn) => {

    const app = polka();
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();

    })
    

    app.get(`/auth`, async (req, res, next) => {
        const accessToken = req.query.accessToken;
        const idToken = req.query.idToken;
        const refreshToken = req.query.refreshToken;
        console.log('token got')
        if (!accessToken) {
            res.end(`success: false`);
            return;
        }

        TokenManager.setToken(accessToken, idToken, refreshToken).then(() => {
            console.log('authenticated!')
            res.end(`success: true`);
            fn();
            app.server.close();
        })



    });
    app.listen(54321, (err) => {
        if (err) {
            vscode.window.showErrorMessage(err.message);
        } else {
            vscode.commands.executeCommand(
                "vscode.open",
                // vscode.Uri.parse(`http://localhost:8080/auth`)
                vscode.Uri.parse(`https://light-haven-315312.web.app/auth`),
                
            );
        }
    });
};