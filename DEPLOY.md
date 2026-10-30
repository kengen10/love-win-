# Publishing Love Wins live

## 1. Domain
Register a domain (e.g. lovewins.org) with any registrar. You will point its DNS A record to your server in step 4.

## 2. Server (about USD 5-6/month)
Create an Ubuntu 24.04 server (DigitalOcean, Hetzner, Linode, Vultr), then:

    sudo apt update && sudo apt install -y nginx sqlite3 ufw git curl build-essential
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
    sudo npm i -g pm2
    sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

## 3. Upload and start the app
    sudo mkdir -p /var/www/love-wins && sudo chown $USER /var/www/love-wins
    # copy the project there (scp -r / rsync / git), then:
    cd /var/www/love-wins && npm install --omit=dev
    npm run setup
    nano .env      # set NODE_ENV=production and SITE_URL=https://yourdomain.org
    chmod 600 .env  # setup already generated a random JWT_SECRET
    npm run create-admin -- admin "your-long-password"
    pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup

## 4. Nginx, DNS and free HTTPS
    # edit the domain names in deploy/nginx.conf first
    sudo cp deploy/nginx.conf /etc/nginx/sites-available/love-wins
    sudo ln -s /etc/nginx/sites-available/love-wins /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.org -d www.yourdomain.org

DNS: add A records for @ and www pointing to the server IP (can take a few hours).

## 5. Real payments (Flutterwave)
1. Create a Flutterwave business account and finish verification (NGO registration documents, settlement account).
2. Settings > API: put the Secret key in FLW_SECRET_KEY.
3. Settings > Webhooks: URL https://yourdomain.org/api/webhooks/flutterwave, choose a secret hash, put the same value in FLW_WEBHOOK_HASH.
4. `pm2 restart love-wins`. Test with test keys, then switch to live keys.

Note: "Monthly" is recorded but each payment is a one-off checkout. Automatic recurring needs Flutterwave payment plans (next phase).

## 6. Backups and updates
Run backups as the same user that owns the app (use `crontab -e`, without sudo).
Add this line, using the absolute Node path returned by `command -v node` if needed:

    0 2 * * * cd /var/www/love-wins && /usr/bin/node scripts/backup.js >> /var/www/love-wins/backup.log 2>&1

Alternatively run `bash scripts/backup.sh` from the project directory.
Backups respect `DB_PATH` and `BACKUP_DIR` from `.env`. The source database must
already exist. Copy /var/www/love-wins/backups off the server regularly using
your private backup destination. Review and remove old backups after confirming
an off-server copy; backups are not deleted automatically.

Restore: stop the app with `pm2 stop love-wins`, move the existing database and
its `-wal`/`-shm` files to a safe directory, then run:

    npm run restore -- backups/<backup-file>.db
    pm2 restart love-wins

Restore verifies SQLite integrity and refuses to overwrite an existing database.
Keep a separate secure copy of `.env`; database backups do not include settings.
Update: upload files, `npm install --omit=dev`, `pm2 restart love-wins`.

## 7. Before announcing
- Replace placeholder email, address, social links (contact page and footer)
- Replace stock Unsplash photos with real, consented photos
- Confirm the 400+ figure; add stories and reports in /admin/
- Have leadership approve privacy.html and safeguarding.html and add real contacts
- Check Uganda data-protection (PDPO) and NGO Bureau requirements for online fundraising
