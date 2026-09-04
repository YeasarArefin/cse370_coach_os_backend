const express = require("express");
const { getHealth, testEmail } = require("../controllers/healthController");

const router = express.Router();

router.get("/", getHealth);
router.get("/email-test", testEmail);

module.exports = router;
