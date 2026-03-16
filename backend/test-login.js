require("dotenv").config();
const mysql = require("mysql2/promise");
const authService = require("./services/auth.service");

(async () => {
    try {
        const result = await authService.login(
            "gkpach.go@gmail.com",
            "D@nielito100pre"
        );

        console.log("RESULTADO:", result);
    } catch (error) {
        console.error("ERROR:", error);
    } finally {
        process.exit();
    }
})();

