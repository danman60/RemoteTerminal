#!/bin/bash
cd "$(dirname "$0")"
echo "=== BUILDING ANDROID APK WITH JAVA 24 ==="
export JAVA_HOME="/c/Program Files/Java/jdk-24"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using Java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain assembleDebug