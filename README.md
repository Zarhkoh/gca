# GCA - Générateur de Cartes Audiocontes

GCA est une application de bureau conçue pour automatiser la préparation de cartes SD destinées aux enceintes **AudioContes Disney**. Elle permet de gérer le téléchargement, le formatage et l'organisation des fichiers audio de manière simple et sécurisée.

## 🚀 Fonctionnement étape par étape

Le processus de création d'une carte SD suit un pipeline rigoureux en 5 étapes :

1.  **Téléchargement** : Récupération automatique de l'archive audio compressée depuis les serveurs Mega.nz via une URL sécurisée.
2.  **Décompression** : Extraction des fichiers dans un répertoire temporaire sécurisé du système.
3.  **Formatage** : Préparation de la carte SD au format **FAT32**. L'application utilise des commandes système natives (`wmic` sur Windows, `diskutil` sur macOS, `mkfs.vfat` sur Linux) pour garantir une compatibilité maximale avec l'enceinte.
4.  **Copie & Inventaire** : Sélection du nombre exact de fichiers (99 ou 150) et copie vers la carte SD. Les fichiers sont organisés dans des dossiers spécifiques (ex: `法国99个故事`) requis par le micrologiciel de l'appareil.
5.  **Nettoyage & Éjection** : Suppression des fichiers temporaires pour libérer de l'espace disque et éjection logicielle de la carte SD pour éviter toute corruption de données.

## 🎨 Interface Utilisateur

L'interface a été pensée pour être intuitive et moderne :
- **Design Sombre** : Utilisation d'un thème "Dark Mode" avec les polices typographiques *Syne* et *DM Mono*.
- **Flux Numéroté** : L'utilisateur est guidé à travers trois sections claires : (01) Sélection du lecteur, (02) Choix de la langue, (03) Type de carte.
- **Suivi Temps Réel** : Un tableau de bord de progression affiche une barre de progression globale et un système d'accordéon détaillant l'état de chaque étape technique (icônes d'état, pourcentages et noms de fichiers en cours de traitement).

## 🛠 Spécifications Techniques

- **Framework** : [Electron](https://www.electronjs.org/) (v41.3.0).
- **Backend** : Node.js avec intégration des API système pour la gestion des disques.
- **Frontend** : HTML5, CSS3 (Variables CSS pour le thème) et JavaScript Vanilla.
- **Dépendances principales** :
    - `megajs` : Gestion des flux de téléchargement depuis Mega.
    - `extract-zip` : Utilitaire de décompression.
- **Sécurité** : Isolation du contexte (Context Isolation) activée et utilisation de scripts de préchargement (Preload) pour sécuriser la communication entre le rendu et le système.
- **Compatibilité** : Windows (nécessite des droits admin), macOS et Linux.

---
*Développé avec ❤️ par Zarhkoh.*
