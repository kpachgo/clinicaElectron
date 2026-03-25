const bcrypt = require("bcrypt");

(async () => {
    const passwordPlano = "D@nielito100pre";
    const hash = await bcrypt.hash(passwordPlano, 10);

    console.log("HASH:", hash);
})();
