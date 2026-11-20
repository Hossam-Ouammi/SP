# Calendrier hors ligne

Ouvrir l'application avec Internet, se connecter et laisser le calendrier charger
une première fois. Le service worker prépare une interface neutre et ses fichiers.
Les séances, options et indisponibilités autorisées sont conservées dans IndexedDB
sur cet appareil, sans mot de passe ni jeton de session.

Après cela, l'application peut être rouverte sans réseau (également depuis le
raccourci installé). Home et le calendrier restent accessibles : création,
modification, déplacement, redimensionnement, suppression, duplication et
répétition des séances ; déclaration, duplication et modification des plages
d'indisponibilité. Les outils administratifs et les autres mutations exigent
Internet. Les données non consultées/préparées ne sont pas disponibles hors ligne.

Les modifications locales sont provisoires, dessinées en pointillés et comptées
dans le bandeau. Elles persistent après fermeture ou rechargement. La file est
limitée à 200 opérations et la copie de compte doit avoir été vérifiée en ligne
depuis moins de sept jours pour continuer à travailler hors ligne.

La synchronisation s'effectue au retour du réseau, à la reprise de l'application
ou avec Synchroniser. Elle nécessite que l'application soit ouverte : aucun
Background Sync fermé n'est promis, notamment sur iPhone. Les contrôles habituels
du serveur (session, rôle, équipe, droits d'écriture, durée, conflits et tarifs)
s'appliquent de nouveau. Une version antérieure ne peut pas écraser un élément
modifié depuis la dernière lecture. Les conflits restent visibles ; Abandonner
retire l'opération locale et sa chaîne dépendante, sans supprimer les autres
brouillons. Pour replanifier un conflit, abandonner le brouillon puis travailler
sur la version actualisée du calendrier.

Chaque envoi utilise un identifiant unique et une révision de départ. Le serveur
enregistre la mutation, son historique et un reçu dans une même transaction
SQLite. Une réponse perdue peut être redemandée sans créer une deuxième séance.
La migration 2026101501 ajoute uniquement offline_operations. Les reçus sont
propres à l'utilisateur et supprimés en cascade avec son compte.

La déconnexion explicite avertit avant de supprimer des modifications non
synchronisées et efface toutes les données locales de compte. Une déconnexion
hors ligne ferme l'accès local immédiatement ; la révocation de la session
serveur attend le retour du réseau. Une expiration de session ne détruit pas
silencieusement les brouillons : se reconnecter au même compte pour les envoyer.

Ne pas considérer ce stockage comme une sauvegarde : effacer les données du
navigateur, désinstaller l'application ou la purge de stockage par le système
peut supprimer les modifications non synchronisées. Éviter les appareils partagés.
Le cache du service worker ne contient ni réponses API privées ni HTML identifié.

Vérification :

```powershell
$env:SP_TEST_BROWSER='1'
$env:SP_TEST_OFFLINE='1'
node scripts/multi-handler-isolation.test.js
node scripts/handler-availability-policy.test.js
node scripts/realtime-recovery.test.js
```

Le test navigateur utilise une base temporaire, le vrai serveur, un contexte
indépendant et une coupure réseau Chromium. Il vérifie le shell, les brouillons
persistants, les identifiants temporaires, la synchronisation ordonnée, les
conflits, l'idempotence, l'absence d'API dans CacheStorage et la déconnexion.
