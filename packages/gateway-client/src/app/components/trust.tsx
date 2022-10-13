import { useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';

export default function Trust() {
    const [trusted, setTrusted] = useState(-1);

    useEffect(() => {
        if (trusted === -1) {
            setTrusted(window.isSecureContext ? 1 : 0);
        }
    }, [trusted]);

    return (
        <Grid
            container
            spacing={2}
            direction="column"
            justifyContent="center"
            alignItems={'center'}
        >
            <Grid item xs={12}>
                <Typography align="center" variant="h4">
                    Trust Device
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography align="center" variant="subtitle1">
                    configure chrome to trust this device
                </Typography>
            </Grid>
            <Grid item xs={12}>
                {trusted === -1 ? null : trusted === 0 ? (
                    <a href="chrome://flags" target="_blank" rel="noreferrer">
                        put http://{window.location.host} into the textbox
                    </a>
                ) : (
                    <p>this origin is trusted!</p>
                )}
            </Grid>
        </Grid>
    );
}
