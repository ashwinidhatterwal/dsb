package in.suhagbhandar.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.Utils;
import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity;
import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {24, 28, 35, 36})
public class LauncherStartupTest {
    @Test public void browserSettingsActivityIsRegistered() throws Exception {
        // LauncherActivity always enables/disables this component during startup.
        // Android rejects that call if the component is missing from the manifest.
        android.app.Application app = RuntimeEnvironment.getApplication();
        assertNotNull(app.getPackageManager().getActivityInfo(
                new ComponentName(app, ManageDataLauncherActivity.class),
                PackageManager.MATCH_DISABLED_COMPONENTS));
    }
    @Test public void splashDrawableCanBeRasterized() {
        assertNotNull(Utils.convertDrawableToBitmap(RuntimeEnvironment.getApplication(), R.drawable.splash));
    }
    @Test public void launcherIconCanBeRasterized() {
        assertNotNull(Utils.convertDrawableToBitmap(RuntimeEnvironment.getApplication(), R.mipmap.ic_launcher));
    }
    @Test public void startsWithoutACompatibleBrowser() {
        Intent intent = new Intent(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try (ActivityController<LauncherActivity> controller =
                Robolectric.buildActivity(LauncherActivity.class, intent)) {
            Activity activity = controller.create().start().resume().get();
            assertNotNull(activity.getWindow().getDecorView());
        }
    }
    @Test public void sharedProductLinksResolveToLauncher() {
        android.app.Application app = RuntimeEnvironment.getApplication();
        for (String path : new String[]{"/product.html?id=DSB-0016", "/products/p-4453422d30303136.html", "/hi/products/p-4453422d30303136.html"}) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://suhagbhandar.in" + path));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setPackage(app.getPackageName());
            android.content.pm.ResolveInfo resolved = app.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            assertNotNull(resolved);
            assertEquals(LauncherActivity.class.getName(), resolved.activityInfo.name);
        }
    }
    private Uri launchUrlFor(String url) throws Exception {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        // Exercise URL selection directly with the real manifest metadata.
        // Full lifecycle/no-browser startup is covered separately above.
        try (ActivityController<LauncherActivity> controller =
                Robolectric.buildActivity(LauncherActivity.class, intent)) {
            LauncherActivity activity = controller.get();
            java.lang.reflect.Field metadata = LauncherActivity.class.getDeclaredField("mMetadata");
            metadata.setAccessible(true);
            metadata.set(activity, LauncherActivityMetadata.parse(activity));
            java.lang.reflect.Method method = LauncherActivity.class.getDeclaredMethod("getLaunchingUrl");
            method.setAccessible(true);
            return (Uri) method.invoke(activity);
        }
    }
    @Test public void sharedProductKeepsItsPathAndQuery() throws Exception {
        String url = "https://suhagbhandar.in/products/p-4453422d30303136.html?size=2.4&utm_source=share";
        assertEquals(Uri.parse(url), launchUrlFor(url));
    }
    @Test public void unrelatedHttpsIntentCannotReplaceTheShop() throws Exception {
        if ((RuntimeEnvironment.getApplication().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            java.lang.reflect.InvocationTargetException error = assertThrows(java.lang.reflect.InvocationTargetException.class,
                () -> launchUrlFor("https://untrusted.example/checkout"));
            assertTrue(error.getCause() instanceof SecurityException);
        } else {
            assertEquals(Uri.parse("https://suhagbhandar.in/"), launchUrlFor("https://untrusted.example/checkout"));
        }
    }
}
