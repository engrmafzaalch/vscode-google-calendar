const vscode = require('vscode');

const ACCESS_TOKEN_KEY = "vs-gcalendar-access";
const ID_TOKEN_KEY = "vs-gcalendar-id";
const REFRESH_TOKEN_KEY = "vs-gcalendar-refresh";

class TokenManager {
  static globalState
  
  static setToken(accessToken, idToken, refreshToken) {
    return new Promise((resolve, reject)=>{
      this.globalState.update(ACCESS_TOKEN_KEY, accessToken);
      this.globalState.update(ID_TOKEN_KEY, idToken);
      this.globalState.update(REFRESH_TOKEN_KEY, refreshToken);
      resolve();
    })
   
  }

  static removeTokens() {
    return new Promise((resolve, reject)=>{
      this.globalState.update(ACCESS_TOKEN_KEY, null);
      this.globalState.update(ID_TOKEN_KEY, null);
      this.globalState.update(REFRESH_TOKEN_KEY, null);
      resolve();
    })
   
  }

  static getToken() {
    return {
      [ACCESS_TOKEN_KEY]: this.globalState.get(ACCESS_TOKEN_KEY),
      [ID_TOKEN_KEY]: this.globalState.get(ID_TOKEN_KEY),
      [REFRESH_TOKEN_KEY]: this.globalState.get(REFRESH_TOKEN_KEY)
    };
  }


}

// class TokenManager {
//     constructor(name, age, email) {
//       this.name = name;
//       this.age = age;
//       this.email = email;
//     }

//     getUserStats() {
//       return `
//         Name: ${this.name}
//         Age: ${this.age}
//         Email: ${this.email}
//       `;
//     }
//   }

module.exports = TokenManager;