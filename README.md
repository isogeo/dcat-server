# dcat-server

Serveur DCAT pour Isogeo.

## Pré-requis

- Node.js 14 et supérieur
- yarn

## Utilisation

### Installation

```bash
$ yarn          # dev

# ou

$ yarn --prod   # production
```

### Configuration

Il faut définir les variables d’environnement listées dans le fichier `.env.sample`. En environnement de développement un fichier `.env` peut tout simplement être créé.

| Nom de la variable | Description | Valeur par défaut |
| --- | --- | --- |
| ISOGEO_API_URL | URL de base de l’API Isogeo | https://api.isogeo.com/v1 |
| ISOGEO_TOKEN_URL | URL d’émission de jeton de la plateforme Isogeo | https://id.api.isogeo.com/oauth/token |
| ISOGEO_CLIENT_ID | Identifiant de l’application | |
| ISOGEO_CLIENT_SECRET | Secret de l’application | |
| DCAT_SERVER_URL | URL publique vers le serveur DCAT | https://dcat-server.isogeo.com |
| PORT | Port d’écoute HTTP| 5000 |

### Exécuter le serveur

```bash
$ yarn start
```

### Tests unitaires

```bash
$ yarn test
```

### Linting

Le linting est réalisé avec [xo](https://github.com/xojs/xo).

```bash
$ yarn lint
```

## Documentation

Le flux DCAT d’un partage Isogeo donné est récupéré grâce à l'URL suivant : `http://localhost:5000/:shareId/:urlToken`.
