# Service de Paiement - Système de Crédits (Stockage en Mémoire)

Ce service gère le système de paiement et de crédits pour la génération d'images. **Les crédits sont stockés en mémoire (Map JavaScript)**, donc ils sont perdus à chaque redémarrage du service. Ce système est adapté pour le développement, la démo ou les tests, mais **pas pour la production**.

---

## 🚀 Fonctionnement

- **Crédits par utilisateur** : Suivi en mémoire (Map JS)
- **Achat de crédits** : Paiement via Stripe, ajout de crédits via webhook
- **Utilisation de crédits** : Décrémentation lors de la génération d'image
- **API REST** : Pour le frontend Next.js

---

## 📦 Packages de Crédits

| Package        | Crédits | Prix   | Description                      |
|---------------|---------|--------|----------------------------------|
| Crédits x100  | 100     | 9,99€  | 100 crédits pour générer des images |

---

## 🛠️ Installation & Lancement

1. **Cloner le projet**
```bash
cd payment-services-MalicknND
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer l'environnement**
```bash
cp env.example .env
# Remplis les clés Stripe et l'ID du prix
```

4. **Démarrer le service**
```bash
npm run dev
```

Le service écoute sur `http://localhost:9001`

---

## 📡 API Principaux Endpoints

- `GET /api/credits/:userId` : Récupère les crédits d'un utilisateur
- `POST /api/credits/use` : Utilise des crédits
- `GET /api/packages` : Liste les packages de crédits
- `POST /api/payment/create-session` : Crée une session Stripe
- `POST /api/webhook/stripe` : Webhook Stripe (ajoute les crédits après paiement)
- `GET /health` : Vérifie la santé du service

---

## ⚠️ Limites du stockage en mémoire

- **Les crédits sont perdus à chaque redémarrage du service**
- **Pas adapté à la production**
- Pour la persistance, il faut brancher une base de données (PostgreSQL, MongoDB, etc.)

---

## 🔄 Flux utilisateur

1. L'utilisateur se connecte
2. Il voit ses crédits (stockés en mémoire côté backend)
3. Il achète des crédits via Stripe
4. Stripe appelle le webhook → crédits ajoutés en mémoire
5. Il utilise ses crédits pour générer des images

---

## 🧪 Tester le service

- Utilise Postman ou curl pour tester les endpoints
- Lance Stripe CLI pour recevoir les webhooks :
  ```bash
  stripe listen --forward-to localhost:9001/api/webhook/stripe
  ```
- Vérifie les logs pour voir l'ajout de crédits

---

## 🗄️ Pour aller plus loin

- **Production** : Branche une vraie base de données pour la persistance
- **Sécurité** : Ajoute une authentification forte
- **Historique** : Ajoute un suivi des transactions

---

## 📞 Support

Pour toute question, ouvre une issue ou contacte le mainteneur du projet.

---

**Note :** Ce service est volontairement simple pour la démo. Pour un usage réel, il faut une base de données pour ne pas perdre les crédits au redémarrage. 