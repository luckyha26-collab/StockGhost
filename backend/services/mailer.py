"""Password-reset e-mail. Uses SMTP when configured; otherwise the link is logged on the server (development)."""
import logging
import smtplib
from email.message import EmailMessage

log = logging.getLogger("stockghost.mail")


def send_mail(app, to, subject, text):
    cfg = app.config
    if not cfg.get("SMTP_HOST"):
        log.warning("SMTP not configured. E-mail to %s | %s | %s", to, subject, text.replace("\n", " "))
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = cfg["EMAIL_FROM"], to, subject
    msg.set_content(text)
    try:
        with smtplib.SMTP(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=15) as s:
            s.starttls()
            if cfg["SMTP_USER"]:
                s.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            s.send_message(msg)
        return True
    except Exception:
        log.exception("Failed to send e-mail")
        return False
