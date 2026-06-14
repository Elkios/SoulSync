import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.pokemon.ExpCurve;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Properties;

// Génère un .rnqs SoulSync FULL CUSTOM via la classe Settings d'UPR.
// Usage : java GenPreset <sortie.rnqs> [config.properties]
//
// Le fichier .properties (clé=valeur) décrit TOUS les réglages. Toute clé absente
// garde le défaut. Modes = index (ordinal) dans l'enum UPR correspondant :
//   mode.wild           0=Inchangé 1=Aléatoire 2=1-pour-1 par zone 3=Global 1-pour-1
//   mode.wildRestriction 0=Aucune 1=Force similaire 2=Tous capturables 3=Thème de type/zone
//   mode.trainers       0=Inchangé 1=Aléatoire 2=Réparti 3=Run principal 4=Thème type 5=Thème type (Gyms/C4)
//   mode.starters       0=Inchangé 2=Complètement aléatoire 3=Avec 2 évolutions (1=CUSTOM interdit)
//   mode.statics        0=Inchangé 1=Aléatoire similaire 2=Complètement aléatoire 3=Force similaire
//   mode.trades         0=Inchangé 1=Donné 2=Donné+demandé
//   mode.abilities      0=Inchangé 1=Aléatoire
//   mode.types          0=Inchangé 1=Aléatoire (suit évolutions) 2=Complètement aléatoire
//   mode.stats          0=Inchangé 1=Mélangées 2=Aléatoires
//   mode.evolutions     0=Inchangé 1=Aléatoire 2=Aléatoire à chaque niveau
//   mode.movesets       0=Inchangé 1=Aléa (préf. même type) 2=Complètement aléa 3=Métronome only
//   mode.tms            0=Inchangé 1=Aléatoire
//   mode.tmCompat       0=Inchangé 1=Aléa (préf. type) 2=Complètement aléa 3=Pleine compat
//   mode.tutors         0=Inchangé 1=Aléatoire
//   mode.tutorCompat    0=Inchangé 1=Aléa (préf. type) 2=Complètement aléa 3=Pleine compat
//   mode.fielditems     0=Inchangé 1=Mélangés 2=Aléatoires 3=Aléatoires équilibrés
//   mode.shopitems      0=Inchangé 1=Mélangés 2=Aléatoires
//   mode.pickup         0=Inchangé 1=Aléatoire
public class GenPreset {

  static Properties P = new Properties();

  static int mode(String key, int def) {
    try { return Integer.parseInt(P.getProperty(key, "" + def).trim()); } catch (Exception e) { return def; }
  }
  static boolean flag(String key, boolean def) {
    String v = P.getProperty(key);
    if (v == null) return def;
    v = v.trim().toLowerCase();
    return v.equals("true") || v.equals("1") || v.equals("yes") || v.equals("on");
  }
  static int num(String key, int def) {
    try { return Integer.parseInt(P.getProperty(key, "" + def).trim()); } catch (Exception e) { return def; }
  }
  // Construit le tableau de booléens pour setXxxMod(boolean...) : true à l'ordinal voulu.
  static boolean[] pick(int ordinal) {
    if (ordinal < 0) ordinal = 0;
    boolean[] b = new boolean[ordinal + 1];
    b[ordinal] = true;
    return b;
  }

  public static void main(String[] args) throws Exception {
    if (args.length < 1) {
      System.out.println("usage: GenPreset <out.rnqs> [config.properties]");
      return;
    }
    String out = args[0];
    if (args.length >= 2) {
      try (FileInputStream in = new FileInputStream(args[1])) { P.load(in); }
      catch (Exception e) { System.out.println("(config illisible, défauts utilisés : " + e.getMessage() + ")"); }
    }

    Settings s = new Settings();
    s.setSelectedEXPCurve(ExpCurve.MEDIUM_FAST);   // évite un NPE au write()
    s.setRomName(P.getProperty("romName", "SoulSync"));

    // ----- Pokémon sauvages -----
    s.setWildPokemonMod(pick(mode("mode.wild", 1)));
    s.setWildPokemonRestrictionMod(pick(mode("mode.wildRestriction", 0)));
    s.setUseTimeBasedEncounters(flag("flag.useTimeBasedEncounters", false));
    s.setBlockWildLegendaries(flag("flag.blockWildLegendaries", false));
    s.setRandomizeWildPokemonHeldItems(flag("flag.randomizeWildHeldItems", false));
    s.setMinimumCatchRateLevel(num("int.minimumCatchRateLevel", 0)); // 0 = off

    // ----- Dresseurs -----
    s.setTrainersMod(pick(mode("mode.trainers", 1)));
    s.setRivalCarriesStarterThroughout(flag("flag.rivalCarriesStarter", false));
    s.setTrainersBlockLegendaries(flag("flag.trainersBlockLegendaries", false));
    s.setTrainersBlockEarlyWonderGuard(flag("flag.trainersBlockEarlyWonderGuard", false));
    boolean ffe = flag("flag.trainersForceFullyEvolved", false);
    s.setTrainersForceFullyEvolved(ffe);
    if (ffe) s.setTrainersForceFullyEvolvedLevel(num("int.forceFullyEvolvedLevel", 30));
    int lvlMod = num("int.trainersLevelModifier", 0); // -50..50
    if (lvlMod < -50) lvlMod = -50; if (lvlMod > 50) lvlMod = 50;
    s.setTrainersLevelModified(lvlMod != 0);
    if (lvlMod != 0) s.setTrainersLevelModifier(lvlMod);
    s.setAdditionalBossTrainerPokemon(Math.max(0, Math.min(5, num("int.additionalBoss", 0))));
    s.setAdditionalImportantTrainerPokemon(Math.max(0, Math.min(5, num("int.additionalImportant", 0))));
    s.setAdditionalRegularTrainerPokemon(Math.max(0, Math.min(5, num("int.additionalRegular", 0))));
    s.setRandomizeHeldItemsForBossTrainerPokemon(flag("flag.heldItemsBoss", false));
    s.setRandomizeHeldItemsForImportantTrainerPokemon(flag("flag.heldItemsImportant", false));
    s.setRandomizeHeldItemsForRegularTrainerPokemon(flag("flag.heldItemsRegular", false));
    s.setDoubleBattleMode(flag("flag.doubleBattleMode", false));
    s.setBetterTrainerMovesets(flag("flag.betterTrainerMovesets", false));
    s.setShinyChance(flag("flag.shinyChance", false));

    // ----- Starters / fixes / échanges -----
    int starters = mode("mode.starters", 2);
    if (starters == 1) starters = 2; // CUSTOM interdit (besoin d'IDs) -> complètement aléatoire
    s.setStartersMod(pick(starters));
    s.setRandomizeStartersHeldItems(flag("flag.randomizeStartersHeldItems", false));
    s.setStaticPokemonMod(pick(mode("mode.statics", 0)));
    s.setInGameTradesMod(pick(mode("mode.trades", 0)));

    // ----- Données des Pokémon -----
    s.setAbilitiesMod(pick(mode("mode.abilities", 0)));
    s.setTypesMod(pick(mode("mode.types", 0)));
    s.setBaseStatisticsMod(pick(mode("mode.stats", 0)));
    s.setEvolutionsMod(pick(mode("mode.evolutions", 0)));

    // ----- Attaques & movesets -----
    s.setMovesetsMod(pick(mode("mode.movesets", 1)));
    s.setMovesetsForceGoodDamaging(flag("flag.movesetsForceGoodDamaging", false));
    int gmc = num("int.guaranteedMoveCount", 0);
    if (gmc > 0) s.setGuaranteedMoveCount(gmc);

    // ----- CT / tutors + compatibilités -----
    s.setTmsMod(pick(mode("mode.tms", 0)));
    s.setTmsHmsCompatibilityMod(pick(mode("mode.tmCompat", 0)));
    s.setMoveTutorMovesMod(pick(mode("mode.tutors", 0)));
    s.setMoveTutorsCompatibilityMod(pick(mode("mode.tutorCompat", 0)));

    // ----- Objets -----
    s.setFieldItemsMod(pick(mode("mode.fielditems", 0)));
    s.setShopItemsMod(pick(mode("mode.shopitems", 0)));
    s.setPickupItemsMod(pick(mode("mode.pickup", 0)));

    // ----- Réglages divers (bitfield MiscTweak) : Challenge Mode=512, Texte rapide=8,
    //       Pokédex national=128, Patch XP B/W=1, etc. L'UI envoie la somme des bits. -----
    s.setCurrentMiscTweaks(num("miscTweaks", 0));

    try (FileOutputStream fos = new FileOutputStream(out)) {
      s.write(fos);
    }
    System.out.println("Preset ecrit : " + out);
  }
}
